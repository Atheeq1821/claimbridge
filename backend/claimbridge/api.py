"""HTTP API for the ClaimBridge console (FastAPI).

The API only reads the graph and writes the same things a human or the Supervisor
would: claim submissions, approvals, outcomes, control commands, policy publishing.
Agents keep coordinating through the graph; the API never talks to them directly.

    uv run uvicorn claimbridge.api:app --port 8000
"""
import asyncio
import json
import random
import threading
from datetime import date
from functools import lru_cache

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from claimbridge import config, db, llm, report
from claimbridge.knowledge import load
from claimbridge.supervisor import approve, command, record_outcome
from claimbridge.tools import coordination as coord
from claimbridge.tools import tenancy

app = FastAPI(title="ClaimBridge API", version="0.4.0")

STEPS = ["RECEIVED", "CLASSIFIED", "RETRIEVED", "VERIFIED", "AWAITING_REVIEW", "APPROVED",
         "VERIFIED_OUTCOME", "CURATED"]
_world_lock = threading.Lock()
_world_job: dict = {"running": False, "action": None, "error": None}
_new_lock = threading.Lock()


def g():
    return db.connect()


@app.on_event("startup")
def _warm_embedder():
    # Entering a claim by hand embeds its notice; load the model now, not on the first click.
    from claimbridge.embed import embed
    threading.Thread(target=lambda: embed(["warm up"]), daemon=True).start()


@lru_cache(maxsize=1)
def truth() -> dict:
    from claimbridge.seed.generate import load_truth
    return load_truth()


def _names(kind: str) -> dict[str, str]:
    return {x["code"]: x["name"] for x in load().raw[kind]}


def _tenants() -> dict[str, str]:
    return {t["tenant_id"]: t["display_name"] for t in load().raw["tenants"]}


def _payload(e: dict) -> dict:
    try:
        return json.loads(e.get("payload") or "{}")
    except json.JSONDecodeError:
        return {}


# ---------------------------------------------------------------- overview

@app.get("/api/overview")
def overview():
    gr = g()
    ctrl = db.one(gr, "MATCH (s:Control {id: 'global'}) RETURN s.world AS world") or {}
    statuses = {r["s"]: r["n"] for r in db.run(gr, """
        MATCH (c:Claim) WHERE c.source <> 'historical'
        RETURN c.status AS s, count(c) AS n""")}
    findings = {r["s"]: r["n"] for r in db.run(gr, "MATCH (f:Finding) RETURN f.status AS s, count(f) AS n")}
    now = db.now_ms()
    workers = db.run(gr, """MATCH (h:WorkerHeartbeat) RETURN h.agent_id AS id, h.role AS role,
                            h.state AS state, h.last_seen AS seen""")
    alive = [w for w in workers if w["seen"] and now - w["seen"] < 15000 and w["state"] not in ("stopped", "killed", "dead")]
    return {
        "world": ctrl.get("world"),
        "statuses": statuses,
        "findings": findings,
        "workers_alive": len([w for w in alive if w["role"] != "supervisor"]),
        "supervisor_alive": any(w["role"] == "supervisor" for w in alive),
        "llm": {"platform": config.LLM_PLATFORM, "model": llm.model_name(), "mode": config.LLM_MODE},
        "world_job": _world_job,
    }


# ------------------------------------------------------------------ claims

@app.get("/api/claims")
def claims():
    gr = g()
    services, reasons, tenants, t = _names("service_categories"), _names("denial_reasons"), _tenants(), truth()
    rows = db.run(gr, """
        MATCH (c:Claim)-[:FOR_SERVICE]->(s:ServiceCategory) WHERE c.source <> 'historical'
        OPTIONAL MATCH (c)-[:DENIED_FOR]->(r:DenialReason)
        OPTIONAL MATCH (c)-[:GOVERNED_BY]->(v:PolicyVersion)
        OPTIONAL MATCH (c)-[:RECOMMENDATION]->(rec:Recommendation)
        RETURN c.claim_id AS claim_id, c.tenant_id AS tenant_id, s.code AS service, c.service_date AS service_date,
               c.status AS status, r.code AS reason, v.label AS version, c.disposition AS disposition,
               c.lease_owner AS lease_owner, c.attempt AS attempt, c.amount AS amount,
               rec.confidence AS confidence, c.event_seq AS events
        ORDER BY claim_id""")
    flags = {}
    for f in db.run(gr, """
        MATCH (c:Claim)-[k:CONSIDERED]->(f:Finding) WHERE c.source <> 'historical' AND k.reason_code <> 'REASON_MISMATCH'
        RETURN c.claim_id AS cid, f.finding_id AS fid, k.reason_code AS code ORDER BY fid"""):
        flags.setdefault(f["cid"], []).append({"finding_id": f["fid"], "code": f["code"]})
    last = {r["cid"]: r["ts"] for r in db.run(gr, """
        MATCH (c:Claim)-[:HAS_EVENT]->(e:CaseEvent) WHERE c.source <> 'historical'
        RETURN c.claim_id AS cid, max(e.ts) AS ts""")}
    out = []
    for r in rows:
        tr = t.get(r["claim_id"], {})
        out.append({**r, "service_name": services.get(r["service"]), "reason_name": reasons.get(r["reason"]),
                    "tenant": tenants.get(r["tenant_id"]), "trap": tr.get("trap"), "note": tr.get("note"),
                    "flags": flags.get(r["claim_id"], []), "updated_at": last.get(r["claim_id"])})
    return out


class InjectBody(BaseModel):
    ids: list[str] = []
    group: str | None = None   # T1..T7, M, normal, all


@app.post("/api/claims/inject")
def inject(body: InjectBody):
    t = truth()
    ids = list(body.ids)
    if body.group:
        grp = body.group.upper()
        ids += [c for c, x in t.items() if (grp == "ALL") or (grp == "NORMAL" and not x["trap"])
                or x["trap"] == grp]
    return {"injected": coord.inject(g(), list(dict.fromkeys(ids)))}


@app.get("/api/catalog")
def catalog():
    """What a caseworker can choose from when entering a claim by hand."""
    raw = load().raw
    pick = lambda kind: [{"code": x["code"], "name": x["name"]} for x in raw[kind]]  # noqa: E731
    return {"tenants": [{"code": t["tenant_id"], "name": t["display_name"]} for t in raw["tenants"]],
            "services": pick("service_categories"), "reasons": pick("denial_reasons"),
            "evidence": pick("evidence_types")}


def _date_int(s: str) -> int:
    try:
        y, m, d = (int(x) for x in s.split("-"))
        return date(y, m, d).year * 10000 + m * 100 + d
    except ValueError:
        raise HTTPException(422, "Dates must be YYYY-MM-DD.") from None


class SampleBody(BaseModel):
    service: str
    reason: str
    service_date: str


@app.post("/api/claims/sample-notice")
def sample_notice(body: SampleBody):
    """A realistic denial notice for (service, reason), citing the clause in force on that date."""
    from claimbridge.seed.notices import notice_text
    kn = load()
    sd = _date_int(body.service_date)
    try:
        clause = kn.route(body.reason, body.service, kn.version_for(sd))
    except (ValueError, KeyError):
        clause = None
    try:
        text = notice_text(random.Random(), "(new)", kn.name("service_categories", body.service), sd,
                           body.reason, clause, "cited")
    except KeyError:
        raise HTTPException(422, "Unknown service or denial reason.") from None
    return {"text": text, "cites": clause.clause_id if clause else None}


class NewClaimBody(BaseModel):
    tenant_id: str
    service: str
    service_date: str              # YYYY-MM-DD
    filed_date: str                # YYYY-MM-DD
    notice: str
    evidence: list[str] = []
    in_network: bool = True
    is_emergency: bool = False
    enrolled_months: int | None = 12
    file_now: bool = True


@app.post("/api/claims/new")
def new_claim(body: NewClaimBody):
    """Enter a denied claim by hand. It gets the same graph shape as a seeded claim
    (Claim, DenialNotice, Evidence) and, if asked, goes straight to the agents."""
    from claimbridge.seed.load import load_cases_into
    kn, gr = load(), g()
    cat = catalog()
    if body.tenant_id not in {t["code"] for t in cat["tenants"]}:
        raise HTTPException(422, "Choose one of the fictional policyholders.")
    if body.service not in {s["code"] for s in cat["services"]}:
        raise HTTPException(422, "Unknown service.")
    bad = set(body.evidence) - {e["code"] for e in cat["evidence"]}
    if bad:
        raise HTTPException(422, f"Unknown evidence: {', '.join(sorted(bad))}.")
    notice = " ".join(body.notice.split())
    if not 40 <= len(notice) <= 4000:
        raise HTTPException(422, "The denial notice should be between 40 and 4000 characters.")
    sd, fd = _date_int(body.service_date), _date_int(body.filed_date)
    lag = (date(fd // 10000, fd // 100 % 100, fd % 100) - date(sd // 10000, sd // 100 % 100, sd % 100)).days
    if lag < 0:
        raise HTTPException(422, "The claim cannot be filed before the service date.")
    try:
        version = kn.version_for(sd)
    except ValueError:
        raise HTTPException(422, "No policy version covers that service date.") from None
    if not db.one(gr, "MATCH (v:PolicyVersion {version_id: $v}) RETURN v.version_id AS v", {"v": version}):
        raise HTTPException(409, f"The {version[1:]} policy is not published in this world yet.")

    with _new_lock:
        n = db.one(gr, """MATCH (c:Claim) WHERE c.claim_id STARTS WITH 'NC-'
                          RETURN count(c) AS n""")["n"]
        cid = f"NC-{n + 1:03d}"
        notice = notice.replace("(new)", cid)
        load_cases_into(gr, kn, [{
            "claim_id": cid, "tenant_id": body.tenant_id, "source": "manual",
            "service": body.service, "service_date": sd, "filed_date": fd, "filing_lag_days": lag,
            "amount": None, "in_network": body.in_network, "is_emergency": body.is_emergency,
            "enrolled_months": body.enrolled_months, "session_number": None,
            "notice_text": notice, "notice_issued": fd, "evidence": list(dict.fromkeys(body.evidence)),
        }])
    filed = coord.inject(gr, [cid]) if body.file_now else []
    return {"claim_id": cid, "filed": bool(filed), "version": version}


@app.get("/api/claims/{cid}")
def claim(cid: str):
    gr = g()
    head = db.one(gr, """
        MATCH (c:Claim {claim_id: $cid})-[:FOR_SERVICE]->(s:ServiceCategory)
        MATCH (c)-[:HAS_NOTICE]->(n:DenialNotice)
        OPTIONAL MATCH (c)-[:GOVERNED_BY]->(v:PolicyVersion)
        OPTIONAL MATCH (n)-[:CITES]->(cl:Clause)
        OPTIONAL MATCH (c)-[:DENIED_FOR]->(r:DenialReason)
        RETURN properties(c) AS claim, s.name AS service, n.text AS notice, n.issued_date AS notice_date,
               properties(v) AS version, properties(cl) AS clause, r.code AS reason, r.name AS reason_name
    """, {"cid": cid})
    if not head:
        raise HTTPException(404, f"no claim {cid}")
    c = head["claim"]
    c.pop("embedding", None)
    evidence = db.run(gr, """
        MATCH (:Claim {claim_id: $cid})-[:HAS_EVIDENCE]->(d:Evidence)-[:OF_TYPE]->(e:EvidenceType)
        RETURN e.code AS code, e.name AS name, d.submitted_date AS submitted ORDER BY code""", {"cid": cid})
    verdicts = db.run(gr, """
        MATCH (c:Claim {claim_id: $cid})-[k:CONSIDERED]->(f:Finding)-[:ON_LINEAGE]->(fl:Clause)
        OPTIONAL MATCH (c)-[:GOVERNED_BY]->(v:PolicyVersion)-[:CONTAINS]->(gov:Clause)
        WHERE gov.lineage_id = fl.lineage_id
        OPTIONAL MATCH (f)-[:CONTRADICTED_BY]->(x:Resolution)
        OPTIONAL MATCH (f)-[:VALID_IN]->(vi:PolicyVersion)
        RETURN f.finding_id AS finding_id, k.reason_code AS code, k.source AS source, f.statement AS statement,
               f.status AS status, f.confidence AS confidence, f.support AS support,
               fl.clause_id AS learned_on, fl.section AS learned_section, gov.clause_id AS governing,
               collect(DISTINCT x.resolution_id) AS contradicted_by, collect(DISTINCT vi.label) AS valid_in
        ORDER BY finding_id""", {"cid": cid})
    for v in verdicts:
        v["valid_in"] = sorted(v["valid_in"])
    gap = [r for r in db.run(gr, """
        MATCH (c:Claim {claim_id: $cid})-[:HAS_NOTICE]->(:DenialNotice)-[:CITES]->(cl:Clause)
        OPTIONAL MATCH (cl)-[:REQUIRES]->(e1:EvidenceType)
        WITH c, collect(DISTINCT e1) AS r1
        OPTIONAL MATCH (c)-[:CONSIDERED {verdict: 'ACCEPTED'}]->(:Finding)-[:NEEDS_EVIDENCE]->(e2:EvidenceType)
        WITH c, r1, collect(DISTINCT e2) AS r2
        UNWIND r1 + r2 AS e
        WITH DISTINCT c, e
        OPTIONAL MATCH (c)-[:HAS_EVIDENCE]->(ev:Evidence)-[:OF_TYPE]->(e)
        WITH e, count(ev) AS have
        RETURN e.code AS code, e.name AS name, have > 0 AS satisfied ORDER BY satisfied, code""", {"cid": cid})]
    timeline = []
    for e in coord.timeline(gr, cid):
        timeline.append({"seq": e["seq"], "type": e["type"], "agent": e["agent"], "step": e["step"],
                         "ts": e["ts"], "payload": _payload(e)})
    tr = truth().get(cid, {})
    return {
        "claim": c, "tenant": _tenants().get(c.get("tenant_id")), "service": head["service"],
        "notice": head["notice"], "notice_date": head["notice_date"],
        "version": head["version"], "clause": head["clause"],
        "reason": head["reason"], "reason_name": head["reason_name"],
        "evidence": evidence, "requirements": gap, "verdicts": verdicts,
        "recommendation": report.actual(gr, cid)["recommendation"],
        "timeline": timeline, "trap": tr.get("trap"), "note": tr.get("note"),
    }


@app.get("/api/claims/{cid}/graph")
def claim_graph(cid: str):
    """The evidence subgraph behind a claim's recommendation (Q10), as nodes and edges."""
    d = claim(cid)
    nodes, edges = {}, []

    def node(i, kind, label, **kw):
        nodes.setdefault(i, {"id": i, "kind": kind, "label": label, **kw})

    c = d["claim"]
    node(cid, "claim", cid, sub=d["service"])
    if d["version"]:
        node(d["version"]["version_id"], "version", f"Policy {d['version']['label']}")
        edges.append({"from": cid, "to": d["version"]["version_id"], "label": "governed by"})
    if d["clause"]:
        cl = d["clause"]
        node(cl["clause_id"], "clause", f"§{cl['section']} {cl['title']}", sub=cl["clause_id"])
        edges.append({"from": cid, "to": cl["clause_id"], "label": "denial cites"})
        if d["version"]:
            edges.append({"from": d["version"]["version_id"], "to": cl["clause_id"], "label": "contains"})
    for r in d["requirements"]:
        node(r["code"], "evidence", r["name"], satisfied=r["satisfied"])
        edges.append({"from": (d["clause"] or {}).get("clause_id", cid), "to": r["code"],
                      "label": "on file" if r["satisfied"] else "missing", "state": "ok" if r["satisfied"] else "missing"})
    for v in d["verdicts"]:
        if v["code"] == "REASON_MISMATCH":
            continue
        node(v["finding_id"], "finding", v["finding_id"], code=v["code"], status=v["status"])
        edges.append({"from": cid, "to": v["finding_id"], "label": v["code"].replace("_", " ").lower(), "code": v["code"]})
        if v["learned_on"]:
            node(v["learned_on"], "clause", v["learned_on"], sub="learned on")
            edges.append({"from": v["finding_id"], "to": v["learned_on"], "label": "learned on"})
        if v["code"] == "VERSION_DRIFT" and v["governing"] and v["governing"] != v["learned_on"]:
            node(v["governing"], "clause", v["governing"], sub="supersedes")
            edges.append({"from": v["governing"], "to": v["learned_on"], "label": "supersedes", "code": "VERSION_DRIFT"})
        for x in v["contradicted_by"]:
            node(x, "resolution", x, sub="upheld")
            edges.append({"from": v["finding_id"], "to": x, "label": "contradicted by", "code": "CONTRADICTED"})
    return {"nodes": list(nodes.values()), "edges": edges}


class ReviewBody(BaseModel):
    reviewer: str = "caseworker"


class OutcomeBody(BaseModel):
    outcome: str
    reviewer: str = "caseworker"


@app.post("/api/claims/{cid}/approve")
def approve_claim(cid: str, body: ReviewBody):
    if not approve(g(), cid, body.reviewer):
        raise HTTPException(409, "This claim is not awaiting review.")
    return {"ok": True}


@app.post("/api/claims/{cid}/outcome")
def outcome_claim(cid: str, body: OutcomeBody):
    if body.outcome not in ("OVERTURNED", "UPHELD", "PARTIAL"):
        raise HTTPException(422, "Outcome must be OVERTURNED, UPHELD or PARTIAL.")
    if not record_outcome(g(), cid, body.outcome, body.reviewer):
        raise HTTPException(409, "Approve the recommendation before recording an outcome.")
    return {"ok": True}


# ------------------------------------------------------------------ memory

@app.get("/api/memory")
def memory():
    gr = g()
    reasons = _names("denial_reasons")
    findings = db.run(gr, """
        MATCH (f:Finding)-[:FOR_REASON]->(r:DenialReason)
        MATCH (f)-[:ON_LINEAGE]->(cl:Clause)
        OPTIONAL MATCH (f)-[:VALID_IN]->(v:PolicyVersion)
        WITH f, r, cl, collect(DISTINCT v.label) AS valid
        OPTIONAL MATCH (f)-[:NEEDS_EVIDENCE]->(e:EvidenceType)
        WITH f, r, cl, valid, collect(DISTINCT e.name) AS needs
        OPTIONAL MATCH (f)-[:CONTRADICTED_BY]->(x:Resolution)
        WITH f, r, cl, valid, needs, count(DISTINCT x) AS contradictions
        OPTIONAL MATCH (f)-[:STALE_BECAUSE]->(sc:Clause)
        OPTIONAL MATCH (f)-[:RECOMMENDS]->(pb:Playbook)
        RETURN f.finding_id AS finding_id, f.statement AS statement, f.status AS status, f.support AS support,
               f.wins AS wins, f.confidence AS confidence, f.origin AS origin, f.updated_at AS updated_at,
               r.code AS reason, cl.lineage_id AS lineage, cl.clause_id AS learned_on, cl.section AS section,
               cl.title AS clause_title, valid, needs, contradictions,
               collect(DISTINCT sc.clause_id) AS stale_because, pb.name AS playbook
        ORDER BY finding_id""")
    for f in findings:
        f["valid_in"] = sorted(f.pop("valid"))
        f["reason_name"] = reasons.get(f["reason"])
    playbooks = db.run(gr, """
        MATCH (p:Playbook)-[:FOR_REASON]->(r:DenialReason)
        OPTIONAL MATCH (p)-[:HAS_STEP]->(s:PlaybookStep)
        WITH p, r, s ORDER BY s.order
        RETURN p.playbook_id AS playbook_id, p.name AS name, p.uses AS uses, p.wins AS wins, r.code AS reason,
               collect(s.action) AS steps ORDER BY name""")
    versions = db.run(gr, """MATCH (v:PolicyVersion) RETURN v.version_id AS id, v.label AS label,
                             v.effective_from AS effective_from ORDER BY effective_from""")
    return {"findings": findings, "playbooks": playbooks, "versions": versions,
            "next_version": next((x["version_id"] for x in load().versions
                                  if x["version_id"] not in {v["id"] for v in versions}), None)}


@app.get("/api/memory/findings/{fid}/precedents")
def precedents(fid: str, x_tenant_id: str = Header(default="TEN-01")):
    rows = tenancy.precedent_detail(g(), fid, x_tenant_id)
    return {"tenant": x_tenant_id, "rows": rows, "redacted": sum(1 for r in rows if not r["own"])}


# ------------------------------------------------------------------- world

class WorldBody(BaseModel):
    action: str                 # "reset" | "reset_2025" | "publish"
    version: str | None = None


def _run_world(action: str, version: str | None):
    try:
        if action == "publish":
            from claimbridge.agents.curator import publish_version
            _world_job["result"] = publish_version(db.connect(), version or "V2026")
        else:
            from claimbridge.seed.load import reset
            reset(upto="V2025" if action == "reset_2025" else None)
            _world_job["result"] = {"reset": action}
    except Exception as e:  # surfaced to the UI
        _world_job["error"] = str(e)
    finally:
        _world_job["running"] = False


@app.post("/api/world")
def world(body: WorldBody):
    if body.action not in ("reset", "reset_2025", "publish"):
        raise HTTPException(422, "Unknown action.")
    with _world_lock:
        if _world_job["running"]:
            raise HTTPException(409, f"Already running: {_world_job['action']}.")
        _world_job.update(running=True, action=body.action, error=None, result=None)
    if body.action == "publish":
        _run_world(body.action, body.version)   # fast: a few queries
        if _world_job["error"]:
            raise HTTPException(409, _world_job["error"])
        return _world_job
    threading.Thread(target=_run_world, args=(body.action, body.version), daemon=True).start()
    return _world_job


# ------------------------------------------------------------------ agents

@app.get("/api/agents")
def agents():
    gr = g()
    now = db.now_ms()
    workers = db.run(gr, """MATCH (h:WorkerHeartbeat) RETURN h.agent_id AS agent_id, h.role AS role,
                            h.state AS state, h.current_claim AS current_claim, h.last_seen AS last_seen
                            ORDER BY role, agent_id""")
    for w in workers:
        stale = not w["last_seen"] or now - w["last_seen"] > 15000
        w["alive"] = not stale and w["state"] not in ("stopped", "killed", "dead")
    leases = db.run(gr, """MATCH (c:Claim) WHERE c.lease_owner IS NOT NULL
                           RETURN c.claim_id AS claim_id, c.status AS status, c.lease_owner AS owner,
                                  c.lease_until AS lease_until, c.attempt AS attempt ORDER BY claim_id""")
    for l in leases:
        l["expires_in_ms"] = (l["lease_until"] or 0) - now
    events = db.run(gr, """
        MATCH (c:Claim)-[:HAS_EVENT]->(e:CaseEvent)
        WHERE e.type IN ['CLAIMED', 'RESUMED', 'LEASE_EXPIRED', 'FENCED_WRITE_REJECTED', 'NEEDS_HUMAN', 'GAVE_UP']
           OR e.type ENDS WITH '_DONE'
        RETURN c.claim_id AS claim_id, e.type AS type, e.agent_id AS agent, e.ts AS ts, e.payload AS payload
        ORDER BY ts DESC LIMIT 40""")
    for e in events:
        e["payload"] = _payload(e)
    commands = db.run(gr, """MATCH (c:Command) RETURN c.cmd_id AS id, c.type AS type, c.target AS target,
                             c.status AS status, c.note AS note, c.created_at AS created_at
                             ORDER BY created_at DESC LIMIT 10""")
    return {"workers": workers, "leases": leases, "events": events, "commands": commands, "now": now}


class StartBody(BaseModel):
    role: str


@app.post("/api/agents/{agent_id}/kill")
def kill(agent_id: str):
    return {"command": command(g(), "KILL", agent_id)}


@app.post("/api/agents/start")
def start(body: StartBody):
    if body.role not in ("intake", "retrieval", "verifier", "planner", "curator"):
        raise HTTPException(422, "Unknown role.")
    return {"command": command(g(), "START", body.role)}


# -------------------------------------------------------------- evaluation

@app.get("/api/eval")
def evaluation():
    p = config.RESULTS_DIR / "latest.json"
    if not p.exists():
        raise HTTPException(404, "No evaluation results yet. Run `cli eval all`.")
    return json.loads(p.read_text(encoding="utf-8"))


# ------------------------------------------------------------------ stream

@app.get("/api/stream")
async def stream():
    """Server-sent events: one 'tick' whenever the graph's activity changes."""
    async def gen():
        last = None
        while True:
            try:
                r = db.one(g(), """
                    OPTIONAL MATCH (e:CaseEvent) WITH max(e.ts) AS ev
                    OPTIONAL MATCH (h:WorkerHeartbeat) WITH ev, collect(h.state + ':' + coalesce(h.current_claim, '')) AS hs
                    OPTIONAL MATCH (f:Finding) WITH ev, hs, count(f) AS nf, max(f.updated_at) AS fu
                    OPTIONAL MATCH (c:Claim) WHERE c.lease_owner IS NOT NULL
                    RETURN ev, hs, nf, fu, collect(c.claim_id + c.lease_owner) AS ls""")
                stamp = json.dumps(r, sort_keys=True, default=str)
                if stamp != last:
                    last = stamp
                    yield f"event: tick\ndata: {json.dumps({'ev': r.get('ev')})}\n\n"
                else:
                    yield ": keepalive\n\n"
            except Exception as e:  # graph being reset
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
            await asyncio.sleep(0.8)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
