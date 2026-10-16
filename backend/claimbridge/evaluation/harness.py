"""Run the evaluation and write eval/results/{raw/*.json, latest.json, latest.md}.

Systems
  claimbridge          the full pipeline (graph + memory), supervised worker pool
  no_memory            the same pipeline with Findings hidden from Retrieval (ablation)
  baseline_rag         plain vector RAG, same LLM, same embedding model as ClaimBridge
  baseline_rag_strong  the same baseline with a much larger embedding model (sensitivity check)
Experiments
  memory gain          claim A's verified win, then a look-alike claim B (docs/07 M11)
  chaos                random worker kills under load (M10)
Each step saves its raw output, so steps can be re-run independently and `report` rebuilds
the tables from whatever is on disk.
"""
import json
import logging
import random
import re
import time
from datetime import datetime

from claimbridge import config, db, llm, report
from claimbridge.evaluation import baseline as bl
from claimbridge.evaluation.score import GROUPS, score
from claimbridge.seed.generate import load_cases, load_truth
from claimbridge.tools import coordination as coord
from claimbridge.tools import tenancy

log = logging.getLogger("claimbridge.eval")

RAW = config.RESULTS_DIR / "raw"
HELD_OUT = ["EV-M-B2"]           # processed only inside the memory-gain experiment
SYSTEM_LABELS = {
    "claimbridge": "ClaimBridge",
    "no_memory": "No-memory ablation",
    "baseline_rag": "Baseline RAG",
    "baseline_rag_strong": "Baseline RAG (large embeddings)",
}


def _save(name: str, data: dict):
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / f"{name}.json").write_text(json.dumps(data, indent=1, default=str), encoding="utf-8")


def _load(name: str) -> dict | None:
    p = RAW / f"{name}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def _eval_ids(truth) -> list[str]:
    return [c for c in truth if c not in HELD_OUT]


# --------------------------------------------------------------------- tokens

def recorded_tokens(tasks: tuple[str, ...]) -> dict[str, tuple[int, int]]:
    """Input/output tokens per claim, from the recorded LLM calls of the given tasks."""
    latest: dict[tuple[str, str], tuple[float, int, int]] = {}
    for f in (config.LLM_CACHE_DIR / config.LLM_PLATFORM).glob("*.json"):
        rec = json.loads(f.read_text(encoding="utf-8"))
        if rec.get("task") not in tasks:
            continue
        m = re.search(r"\bEV-[A-Z0-9]+-[A-Z0-9]+\b", rec.get("user", ""))
        if not m:
            continue
        key, mt = (rec["task"], m.group(0)), f.stat().st_mtime
        if key not in latest or mt > latest[key][0]:
            latest[key] = (mt, rec.get("input_tokens") or 0, rec.get("output_tokens") or 0)
    out: dict[str, tuple[int, int]] = {}
    for (task, cid), (_, i, o) in latest.items():
        a, b = out.get(cid, (0, 0))
        out[cid] = (a + i, b + o)
    return out


# ---------------------------------------------------------------- ClaimBridge

def predict_claimbridge(g, ids: list[str], truth: dict, tasks: tuple[str, ...]) -> dict:
    tokens = recorded_tokens(tasks)
    preds = {}
    for c in ids:
        a = report.actual(g, c)
        rec = a["recommendation"] or {"items": []}
        codes = {v["finding_id"]: v["code"] for v in a["verdicts"]}
        accepted = sorted(f for f, k in codes.items() if k == "ACCEPTED")
        leaked = 0
        probe = truth[c].get("tenant_probe")
        if probe:
            if tenancy.claim_for_tenant(g, c, probe):
                leaked += 3
            for f in accepted:
                leaked += tenancy.leaked_fields(tenancy.precedent_detail(g, f, probe))
        ti, to = tokens.get(c, (0, 0))
        preds[c] = {
            "status": a.get("status"), "reason": a.get("reason"), "version": a.get("version"),
            "accepted": accepted,
            "rejected": {f: k for f, k in codes.items() if k not in ("ACCEPTED", "REASON_MISMATCH")},
            "missing": a["missing"], "disposition": a.get("disposition"),
            "items_total": len(rec["items"]),
            "items_unsupported": sum(1 for i in rec["items"] if not i["cites"]),
            "guard_dropped": rec.get("guard_dropped", 0), "guard_added": rec.get("guard_added", 0),
            "confidence": rec.get("confidence"), "leaked_fields": leaked,
            "tokens_in": ti, "tokens_out": to,
        }
    return preds


def memory_gain_claimbridge(g, env: dict) -> dict:
    from claimbridge.cli import spawn_supervisor, stop_supervisor, wait_for
    from claimbridge.supervisor import approve, record_outcome
    b1 = report.actual(g, "EV-M-B1")
    sup = spawn_supervisor(env=env)
    try:
        approve(g, "EV-M-A", "eval")
        record_outcome(g, "EV-M-A", "OVERTURNED", "eval")
        wait_for(g, ["EV-M-A"], 180, done={"CURATED", "NEEDS_HUMAN"})
        curated = json.loads(coord.timeline(g, "EV-M-A")[-1]["payload"])
        coord.inject(g, ["EV-M-B2"])
        wait_for(g, ["EV-M-B2"], 600)
    finally:
        stop_supervisor(g, sup)
    b2 = report.actual(g, "EV-M-B2")

    def view(a):
        rec = a["recommendation"] or {}
        return {"accepted": [v["finding_id"] for v in a["verdicts"] if v["code"] == "ACCEPTED"],
                "disposition": a.get("disposition"), "confidence": rec.get("confidence"),
                "uncertainty": rec.get("uncertainty")}
    return {"learned": [f["finding_id"] for f in curated.get("findings", [])],
            "curator_action": curated.get("action"), "before": view(b1), "after": view(b2)}


def run_claimbridge(no_memory: bool = False) -> dict:
    from claimbridge.cli import run_pipeline
    from claimbridge.seed.load import reset
    name = "no_memory" if no_memory else "claimbridge"
    env = {"CB_NO_MEMORY": "1"} if no_memory else {}
    truth = load_truth()
    ids = _eval_ids(truth)
    reset()
    g = db.connect()
    t0 = time.time()
    run_pipeline(ids, env=env, quiet=True)
    wall = time.time() - t0
    tasks = ("intake", "planner_nomem") if no_memory else ("intake", "planner")
    preds = predict_claimbridge(g, ids, truth, tasks)
    gain = memory_gain_claimbridge(g, env)
    data = {"system": name, "wall_seconds": round(wall, 1), "predictions": preds, "memory_gain": gain}
    _save(name, data)
    return data


# ------------------------------------------------------------------- baseline

def predict_baseline(case: dict, result: dict, chunk_findings: dict) -> dict:
    a = result["answer"]
    retrieved = {h["chunk_id"]: h for h in result["retrieved"]}
    accepted = sorted({chunk_findings[f"CS-{p}"] for p in a["precedent_case_ids"]
                       if chunk_findings.get(f"CS-{p}")})
    unsupported = sum(1 for i in a["items"] if not i["cite_ids"] or any(x not in retrieved for x in i["cite_ids"]))
    exposed = set()
    for p in a["precedent_case_ids"]:
        exposed.add(f"CS-{p}")
    for i in a["items"]:
        exposed.update(x for x in i["cite_ids"] if x.startswith("CS-"))
    leaked = 3 * sum(1 for x in exposed if x in retrieved and retrieved[x]["tenant_id"]
                     and retrieved[x]["tenant_id"] != case["tenant_id"])
    return {
        "reason": a["denial_reason"], "version": a["policy_version"], "accepted": accepted,
        "precedent_cases": a["precedent_case_ids"], "rejected": {},
        "missing": sorted(set(a["missing_evidence"])), "disposition": a["disposition"],
        "items_total": len(a["items"]), "items_unsupported": unsupported, "leaked_fields": leaked,
        "tokens_in": result["llm"]["input_tokens"] or 0, "tokens_out": result["llm"]["output_tokens"] or 0,
        "retrieved": [h["chunk_id"] for h in result["retrieved"]],
    }


def run_baseline(model: str, name: str) -> dict:
    truth = load_truth()
    cases = {c["claim_id"]: c for c in load_cases()}
    bl.build_index(model)
    chunk_findings = {c["chunk_id"]: c.get("finding_id") for c in bl.corpus()}
    preds, raw = {}, {}
    t0 = time.time()
    for cid in _eval_ids(truth):
        try:
            res = bl.answer(cases[cid], model)
        except llm.LLMError as e:
            log.error("baseline %s failed on %s: %s", name, cid, e)
            continue
        raw[cid] = res
        preds[cid] = predict_baseline(cases[cid], res, chunk_findings)
    wall = time.time() - t0

    # Memory gain: the baseline's only memory is its corpus. Add A's verified win as a case record.
    a = cases["EV-M-A"]
    chunk = {"chunk_id": "CS-EV-M-A", "claim_id": "EV-M-A", "tenant_id": a["tenant_id"],
             "finding_id": "LEARNED-FROM-EV-M-A",
             "text": (f"Past case EV-M-A. Service: Ambulance transport, service date 2025-06-10 (policy V2025). "
                      f"Emergency: yes. In network: yes. Denial notice: {bl.notice_core(a['notice_text'])} "
                      "Evidence submitted on appeal: Emergency attestation (EMERGENCY_ATTESTATION), "
                      "Itemized bill (ITEMIZED_BILL). Verified outcome: OVERTURNED.")}
    bl.add_case(model, chunk)
    chunk_findings["CS-EV-M-A"] = "LEARNED-FROM-EV-M-A"
    gain = None
    try:
        b2 = predict_baseline(cases["EV-M-B2"], bl.answer(cases["EV-M-B2"], model), chunk_findings)
        b1 = preds.get("EV-M-B1", {})
        gain = {"before": {"precedent_cases": b1.get("precedent_cases"), "disposition": b1.get("disposition")},
                "after": {"precedent_cases": b2["precedent_cases"], "disposition": b2["disposition"],
                          "retrieved_new_case": "CS-EV-M-A" in b2["retrieved"]}}
    except llm.LLMError as e:
        log.error("baseline %s memory-gain step failed: %s", name, e)
    missing = [c for c in _eval_ids(truth) if c not in preds]
    data = {"system": name, "embedding_model": model, "top_k": config.BASELINE_TOP_K,
            "wall_seconds": round(wall, 1), "predictions": preds, "memory_gain": gain,
            "not_run": missing, "answers": {c: r["answer"] for c, r in raw.items()}}
    _save(name, data)
    return data


# ---------------------------------------------------------------------- chaos

def run_chaos(n_claims: int = 12, kill_every_s: float = 4.0, max_kills: int = 10, seed: int = 7) -> dict:
    """Random hard kills of workers that hold a lease, with replacements started each time."""
    from claimbridge.cli import spawn_supervisor, stop_supervisor
    from claimbridge.seed.load import reset
    from claimbridge.supervisor import command
    truth = load_truth()
    rng = random.Random(seed)
    ids = [c for c in _eval_ids(truth) if not c.startswith("EV-M")][:n_claims]
    reset()
    g = db.connect()
    env = {"STEP_DELAY_S": "2", "LEASE_TTL_S": "4", "HEARTBEAT_S": "1"}
    pool = "intake=2,retrieval=2,verifier=2,planner=2,curator=1"
    coord.inject(g, ids)
    sup = spawn_supervisor(pool, env)
    kills = []
    t0 = time.time()
    try:
        while time.time() - t0 < 900:
            st = {r["id"]: (r["s"], r["o"]) for r in db.run(
                g, "MATCH (c:Claim) WHERE c.claim_id IN $ids RETURN c.claim_id AS id, c.status AS s, "
                   "c.lease_owner AS o", {"ids": ids})}
            if all(s in ("AWAITING_REVIEW", "NEEDS_HUMAN") for s, _ in st.values()):
                break
            dead = {k["agent"] for k in kills}   # a killed worker keeps its lease until it expires
            busy = sorted((o, c) for c, (_, o) in st.items() if o and o != "supervisor" and o not in dead)
            if busy and len(kills) < max_kills and (not kills or time.time() - kills[-1]["t"] >= kill_every_s):
                victim, cid = rng.choice(busy)
                command(g, "KILL", victim)
                command(g, "START", victim.rsplit("-", 1)[0])
                kills.append({"agent": victim, "claim": cid, "t": time.time()})
                log.warning("chaos: killed %s holding %s", victim, cid)
            time.sleep(0.5)
    finally:
        stop_supervisor(g, sup)
    wall = time.time() - t0

    done_steps, duplicates, fenced, expired = {}, 0, 0, 0
    for c in ids:
        tl = coord.timeline(g, c)
        seen = {}
        for e in tl:
            if e["type"].endswith("_DONE"):
                seen[e["type"]] = seen.get(e["type"], 0) + 1
            fenced += e["type"] == "FENCED_WRITE_REJECTED"
            expired += e["type"] == "LEASE_EXPIRED"
        duplicates += sum(n - 1 for n in seen.values() if n > 1)
        done_steps[c] = tl
    # A kill "interrupted a step" when the killed agent was still the claim's last owner,
    # i.e. another agent later RESUMED that claim taking over from it.
    takeovers, recoveries = [], []
    for c, tl in done_steps.items():
        for e in tl:
            if e["type"] != "RESUMED":
                continue
            prev = json.loads(e["payload"] or "{}").get("previous_owner")
            k = next((k for k in kills if k["agent"] == prev and k["claim"] == c), None)
            if not k:
                continue
            nxt = [x["ts"] / 1000 for x in tl if x["type"].endswith("_DONE") and x["seq"] > e["seq"]]
            takeovers.append({"claim": c, "killed": prev, "resumed_by": e["agent"]})
            if nxt:
                recoveries.append(round(min(nxt) - k["t"], 2))
    checks = [report.check(g, truth[c]) for c in ids]
    data = {
        "claims": len(ids), "kills": len(kills), "pool": pool, "lease_ttl_s": 4, "step_delay_s": 2,
        "completed": sum(1 for r in checks if r["status"] == "AWAITING_REVIEW"),
        "correct": sum(r["ok"] for r in checks),
        "duplicate_step_outputs": duplicates, "fenced_writes_rejected": fenced,
        "lease_expiries_recorded": expired,
        "steps_interrupted": len(takeovers), "takeovers": takeovers,
        "recovery_seconds": recoveries,
        "mean_recovery_seconds": round(sum(recoveries) / len(recoveries), 2) if recoveries else None,
        "wall_seconds": round(wall, 1),
        "killed": [{"agent": k["agent"], "claim": k["claim"]} for k in kills],
    }
    _save("chaos", data)
    return data


# --------------------------------------------------------------------- report

def _fmt(v, pct=True):
    if v is None:
        return "n/a"
    if isinstance(v, float) and pct:
        return f"{v * 100:.0f}%"
    return str(v)


def build_report() -> dict:
    all_truth = {c: t for c, t in load_truth().items() if c not in HELD_OUT}
    systems = [s for s in SYSTEM_LABELS if _load(s)]
    raw = {s: _load(s) for s in systems}
    # Every system is scored on the same claims: those every system produced an answer for.
    common = [c for c in all_truth if all(c in raw[s]["predictions"] for s in systems)]
    truth = {c: all_truth[c] for c in common}
    scored = {s: score(raw[s]["predictions"], truth) for s in systems}
    chaos = _load("chaos")
    out = {"generated_at": datetime.now().isoformat(timespec="seconds"),
           "llm": f"{config.LLM_PLATFORM}/{llm.model_name()}",
           "scored_claims": len(common), "total_claims": len(all_truth),
           "not_scored": [c for c in all_truth if c not in common],
           "not_run": {s: raw[s].get("not_run") or [] for s in systems},
           "systems": {s: {"label": SYSTEM_LABELS[s], **scored[s],
                           "wall_seconds": raw[s].get("wall_seconds"),
                           "embedding_model": raw[s].get("embedding_model"),
                           "memory_gain": raw[s].get("memory_gain")} for s in systems},
           "chaos": chaos}
    config.RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (config.RESULTS_DIR / "latest.json").write_text(json.dumps(out, indent=1, default=str), encoding="utf-8")
    (config.RESULTS_DIR / "latest.md").write_text(render_md(out, truth), encoding="utf-8")
    return out


ROWS = [
    ("M1_reason_accuracy", "Denial reason accuracy", "↑"),
    ("M2_version_accuracy", "Governing policy version accuracy", "↑"),
    ("M3_precedent_precision", "Precedent precision", "↑"),
    ("M3_precedent_recall", "Precedent recall", "↑"),
    ("M4_wrong_precedent_rate", "Wrong-precedent rate (claims reusing a precedent that does not apply)", "↓"),
    ("M5_missing_evidence_f1", "Missing-evidence F1", "↑"),
    ("M6_disposition_accuracy", "Disposition accuracy", "↑"),
    ("M7_unsupported_item_rate", "Unsupported recommendation items", "↓"),
    ("M8_stale_precedent_avoided", "Stale or contradicted precedent avoided", "↑"),
    ("M8_stale_precedent_explained", "…and rejected with the right reason", "↑"),
    ("M9_tenant_fields_leaked", "Other-tenant case fields exposed (T7)", "↓"),
    ("M12_tokens_per_claim", "LLM tokens per claim", "↓"),
    ("all_correct", "Claims fully correct (reason, version, precedents, evidence, disposition)", "↑"),
]


def render_md(out: dict, truth: dict) -> str:
    S = out["systems"]
    names = list(S)
    L = []
    L.append("# ClaimBridge evaluation results\n")
    L.append(f"Generated {out['generated_at']} · LLM `{out['llm']}` · {len(truth)} evaluation claims "
             f"(synthetic, see docs/03) · ground truth from an independent rule engine.\n")
    if out["not_scored"]:
        gaps = "; ".join(f"{S[s]['label']}: {', '.join(v)}" for s, v in out["not_run"].items() if v)
        L.append(f"> **Partial run.** Every system is scored on the same {out['scored_claims']} of "
                 f"{out['total_claims']} claims. Not yet run: {gaps}. Re-run `cli eval baseline report` to "
                 "complete; recorded answers replay, so only the missing claims call the LLM.\n")
    emb = {s: S[s].get("embedding_model") for s in names if S[s].get("embedding_model")}
    L.append("Systems: " + "; ".join(
        f"**{S[s]['label']}**" + (f" (`{emb[s]}`, top-{config.BASELINE_TOP_K})" if s in emb else "")
        for s in names) + ".\n")
    L.append("## Headline metrics\n")
    L.append("| Metric | " + " | ".join(S[s]["label"] for s in names) + " |")
    L.append("|---|" + "---:|" * len(names))
    for key, label, arrow in ROWS:
        pct = key not in ("M9_tenant_fields_leaked", "M12_tokens_per_claim")
        L.append(f"| {label} {arrow} | " + " | ".join(_fmt(S[s]["metrics"].get(key), pct) for s in names) + " |")
    L.append("")

    L.append("## By trap type (claims fully correct)\n")
    L.append("| Group | " + " | ".join(S[s]["label"] for s in names) + " |")
    L.append("|---|" + "---:|" * len(names))
    labels = {"T1": "T1 version drift", "T2": "T2 same reason, wrong clause", "T3": "T3 missing evidence",
              "T4": "T4 contradicted memory", "T5": "T5 condition unmet", "T6": "T6 no basis",
              "T7": "T7 tenant isolation", "M": "M memory scenario", "normal": "Normal cases"}
    for gname in GROUPS:
        cells = []
        for s in names:
            ok, n = S[s]["by_group"].get(gname, [0, 0])
            cells.append(f"{ok}/{n}" if n else "-")
        L.append(f"| {labels[gname]} | " + " | ".join(cells) + " |")
    L.append("")

    L.append("## Why wrong precedents were used\n")
    L.append("Each time a system relied on a precedent that does not apply, the ground truth says why it does not:\n")
    L.append("| System | " + " | ".join(["VERSION_DRIFT", "LINEAGE_MISMATCH", "CONTRADICTED", "CONDITION_UNMET",
                                         "NOT_APPLICABLE"]) + " |")
    L.append("|---|---:|---:|---:|---:|---:|")
    for s in names:
        w = S[s]["wrong_precedent_by_code"]
        L.append(f"| {S[s]['label']} | " + " | ".join(str(w.get(k, 0)) for k in
                 ["VERSION_DRIFT", "LINEAGE_MISMATCH", "CONTRADICTED", "CONDITION_UNMET", "NOT_APPLICABLE"]) + " |")
    L.append("")

    L.append("## Memory gain (M11)\n")
    L.append("Claim EV-M-A (ambulance, emergency) is approved and its real outcome recorded as OVERTURNED. "
             "EV-M-B1 was processed before that, EV-M-B2 (same facts) after.\n")
    for s in names:
        mg = S[s].get("memory_gain") or {}
        if not mg:
            continue
        b, a = mg.get("before", {}), mg.get("after", {})
        if "accepted" in b:
            L.append(f"- **{S[s]['label']}**: before: precedents {b['accepted'] or 'none'}, confidence "
                     f"{b['confidence']}; after: precedents {a['accepted'] or 'none'}, confidence {a['confidence']}"
                     f" (Curator: {mg.get('curator_action')} {mg.get('learned')}).")
        else:
            L.append(f"- **{S[s]['label']}**: before: precedent cases {b.get('precedent_cases') or 'none'}; "
                     f"after adding EV-M-A to the corpus: retrieved it: {a.get('retrieved_new_case')}, "
                     f"precedent cases {a.get('precedent_cases') or 'none'}.")
    L.append("")

    ch = out.get("chaos")
    if ch:
        L.append("## Coordination under failure (M10)\n")
        L.append(f"{ch['claims']} claims, worker pool `{ch['pool']}`, {ch['kills']} random hard kills of workers "
                 f"holding a lease (a replacement started each time), lease TTL {ch['lease_ttl_s']} s.\n")
        L.append("| Measure | Result |\n|---|---:|")
        L.append(f"| Claims completed | {ch['completed']}/{ch['claims']} |")
        L.append(f"| Claims correct | {ch['correct']}/{ch['claims']} |")
        L.append(f"| Kills that interrupted a step in progress | {ch.get('steps_interrupted', 'n/a')} "
                 f"of {ch['kills']} |")
        L.append(f"| …each resumed by another worker | {len(ch.get('recovery_seconds', []))} |")
        L.append(f"| Mean time from kill to the interrupted step completing | {ch['mean_recovery_seconds']} s "
                 f"(includes the {ch['lease_ttl_s']} s lease timeout) |")
        L.append(f"| Duplicate step outputs | {ch['duplicate_step_outputs']} |")
        L.append(f"| Late writes fenced out | {ch['fenced_writes_rejected']} |")
        L.append("")
        L.append("Kills that land after a worker already committed its step interrupt nothing; the claim "
                 "simply moves on. The Supervisor's `LEASE_EXPIRED` event is recorded only when it sees the "
                 "expired lease before another replica reclaims it, so `RESUMED` events are the reliable count.")
        L.append("")

    if "claimbridge" in S:
        fails = [(c, v) for c, v in S["claimbridge"]["per_claim"].items() if not v["ok"]]
        L.append("## ClaimBridge failures\n")
        if not fails:
            L.append("None in this run.\n")
        for c, v in fails:
            bad = [k for k, ok in v["checks"].items() if not ok]
            L.append(f"- {c} ({truth[c]['trap'] or 'normal'}): wrong {', '.join(bad)}")
        L.append("")

    L.append("## Per-claim results\n")
    L.append("| Claim | Trap | " + " | ".join(S[s]["label"] for s in names) + " |")
    L.append("|---|---|" + "---|" * len(names))
    for c, t in truth.items():
        cells = []
        for s in names:
            pc = S[s]["per_claim"].get(c)
            if not pc:
                cells.append("-")
            else:
                cells.append("✅" if pc["ok"] else "❌ " + ",".join(k for k, ok in pc["checks"].items() if not ok))
        L.append(f"| {c} | {t['trap'] or '-'} | " + " | ".join(cells) + " |")
    L.append("")

    L.append("## How to read this\n")
    L.append("- The **baseline** uses the same LLM, the same documents (every clause of every policy version, "
             "every historical case record with its verified outcome) and, by default, the same embedding model "
             "as ClaimBridge. It is told to use the version in force on the service date and to cite passages. "
             "Only graph reasoning differs. The large-embedding run checks that its failures are not just weak "
             "retrieval.")
    L.append("- The **no-memory ablation** is ClaimBridge with Findings hidden: it isolates what semantic memory "
             "adds on top of versioned clauses and gates.")
    L.append("- Baseline precedents are past cases mapped to the Finding they support; cited losses (which "
             "support no Finding) are not counted as precedents.")
    L.append("- Missing evidence is not scored on claims whose correct disposition is NO_BASIS_ESCALATE: when no "
             "appeal is possible, which documents are missing is moot.")
    L.append("- The no-memory ablation cannot name precedents by design, so it fails the precedent check on "
             "every claim that has one; compare it on dispositions and evidence, where memory is not needed.")
    L.append("- M9 counts other-tenant case fields (claim ID, date, notice text) put in front of a tenant "
             "(3 per exposed case). ClaimBridge's precedent lookup is tenant-scoped (Q11).")
    L.append("")
    L.append("## Threats to validity\n")
    L.append("- The data is synthetic and the ground truth comes from rules we wrote (independent Python code, "
             "not the Cypher); real denials are messier.")
    L.append(f"- {len(truth)} scored claims is a small sample; one claim is about "
             f"{100 / max(len(truth), 1):.0f} points.")
    L.append("- The baseline prompt was written once and not tuned per trap; a heavily engineered RAG could do "
             "better.")
    L.append("- LLM outputs are recorded and replayed for reproducibility; a fresh live run can differ slightly.")
    L.append("- Nothing here measures real-world appeal outcomes.")
    return "\n".join(L) + "\n"
