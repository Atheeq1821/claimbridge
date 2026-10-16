"""Supervisor: deterministic infrastructure, not an agent (no LLM).

  - runs the worker pool (each worker is its own OS process) and executes control
    commands that anyone writes into the graph: KILL <agent>, START <role>, SHUTDOWN;
  - lease reaper: records LEASE_EXPIRED when a worker dies holding a claim (any
    replica of that role then reclaims it on its own);
  - marks workers whose heartbeat stopped as dead;
  - the human gate: only `approve` / `record_outcome` move a claim past review.
"""
import logging
import os
import subprocess
import sys
import time

from claimbridge import config, db
from claimbridge.tools import coordination as coord

log = logging.getLogger("claimbridge.supervisor")

DEFAULT_POOL = {"intake": 1, "retrieval": 1, "verifier": 2, "planner": 1, "curator": 1}
ME = "supervisor"


# ------------------------------------------------------------------ human gate

def approve(g, cid: str, reviewer: str) -> bool:
    params = {"cid": cid, "who": reviewer, "now": db.now_ms()}
    ok = db.one(g, """
        MATCH (c:Claim {claim_id: $cid})
        WHERE c.status = 'AWAITING_REVIEW' AND c.lease_owner IS NULL
        SET c.status = 'APPROVED'
        WITH c
        OPTIONAL MATCH (c)-[:RECOMMENDATION]->(rec:Recommendation)
        SET rec.approved_by = $who, rec.approved_at = $now
        RETURN c.claim_id AS ok
    """, params)
    if ok:
        coord.append_event(g, cid, "APPROVED", reviewer, "reviewer", "AWAITING_REVIEW", {"reviewer": reviewer})
    return ok is not None


def record_outcome(g, cid: str, outcome: str, reviewer: str) -> bool:
    """The real-world result of the appeal, entered by a human. Feeds the Curator."""
    if outcome not in ("OVERTURNED", "UPHELD", "PARTIAL"):
        raise ValueError(outcome)
    ok = db.one(g, """
        MATCH (c:Claim {claim_id: $cid})-[:HAS_NOTICE]->(:DenialNotice)-[:CITES]->(cl:Clause)
        WHERE c.status = 'APPROVED'
        CREATE (res:Resolution {resolution_id: 'R-' + $cid, outcome: $outcome, verified: true,
                                verified_on: $today, verified_by: $who})
        CREATE (c)-[:RESOLVED_BY]->(res)
        CREATE (res)-[:RELIED_ON]->(cl)
        SET c.status = 'VERIFIED_OUTCOME'
        WITH c, res
        OPTIONAL MATCH (c)-[:HAS_EVIDENCE]->(d:Evidence)
        FOREACH (_ IN CASE WHEN d IS NULL THEN [] ELSE [1] END | CREATE (res)-[:SUPPORTED_BY]->(d))
        RETURN DISTINCT c.claim_id AS ok
    """, {"cid": cid, "outcome": outcome, "who": reviewer,
          "today": int(time.strftime("%Y%m%d"))})
    if ok:
        coord.append_event(g, cid, "OUTCOME_RECORDED", reviewer, "reviewer", "APPROVED",
                           {"outcome": outcome, "reviewer": reviewer})
    return ok is not None


# ------------------------------------------------------------------ commands

def command(g, ctype: str, target: str | None = None) -> str:
    cmd_id = f"CMD-{db.now_ms()}-{os.getpid()}"
    db.run(g, """CREATE (:Command {cmd_id: $id, type: $t, target: $target, status: 'PENDING',
                                   created_at: $now})""",
           {"id": cmd_id, "t": ctype, "target": target, "now": db.now_ms()})
    return cmd_id


def request_shutdown(g):
    db.run(g, "MERGE (s:Control {id: 'global'}) SET s.shutdown_at = $now", {"now": db.now_ms()})


# ------------------------------------------------------------------ the loop

class Supervisor:
    def __init__(self, pool: dict[str, int] | None = None, env: dict | None = None, tick_s: float = 1.0):
        self.pool = pool or DEFAULT_POOL
        self.env = env or {}
        self.tick_s = tick_s
        self.g = db.connect()
        self.procs: dict[str, subprocess.Popen] = {}
        self.counter: dict[str, int] = {}
        self.started_at = db.now_ms()

    def spawn(self, role: str) -> str:
        self.counter[role] = self.counter.get(role, 0) + 1
        agent_id = f"{role}-{self.counter[role]}"
        cmd = [sys.executable, "-m", "claimbridge.cli", "worker", role, "--id", agent_id]
        self.procs[agent_id] = subprocess.Popen(cmd, cwd=config.BACKEND_DIR, env={**os.environ, **self.env})
        log.info("started %s (pid %s)", agent_id, self.procs[agent_id].pid)
        return agent_id

    def kill(self, agent_id: str) -> bool:
        p = self.procs.get(agent_id)
        if not p or p.poll() is not None:
            return False
        p.kill()  # hard kill: no cleanup, its lease is left to expire
        p.wait()
        coord.heartbeat(self.g, agent_id, agent_id.rsplit("-", 1)[0], "killed")
        log.warning("killed %s", agent_id)
        return True

    def reap_leases(self) -> list[dict]:
        expired = db.run(self.g, """
            MATCH (c:Claim)
            WHERE c.lease_owner IS NOT NULL AND c.lease_until < $now
              AND coalesce(c.reaped, '') <> c.lease_owner + ':' + toString(c.attempt)
            SET c.reaped = c.lease_owner + ':' + toString(c.attempt)
            RETURN c.claim_id AS claim_id, c.lease_owner AS owner, c.status AS status, c.attempt AS attempt
        """, {"now": db.now_ms()})
        for e in expired:
            coord.append_event(self.g, e["claim_id"], "LEASE_EXPIRED", ME, "supervisor", e["status"],
                               {"owner": e["owner"], "attempt": e["attempt"]})
            log.warning("lease of %s on %s expired", e["owner"], e["claim_id"])
        return expired

    def mark_dead(self):
        db.run(self.g, """
            MATCH (h:WorkerHeartbeat)
            WHERE h.last_seen < $cutoff AND NOT h.state IN ['stopped', 'killed', 'dead']
            SET h.state = 'dead'
        """, {"cutoff": db.now_ms() - int(3 * config.LEASE_TTL_S * 1000)})

    def handle_commands(self) -> bool:
        """Returns False when a SHUTDOWN was requested."""
        cmds = db.run(self.g, """
            MATCH (c:Command {status: 'PENDING'}) RETURN c.cmd_id AS id, c.type AS type, c.target AS target
            ORDER BY c.created_at
        """)
        keep_running = True
        for c in cmds:
            ok, note = True, None
            if c["type"] == "KILL":
                ok = self.kill(c["target"])
                note = None if ok else "no such running worker"
            elif c["type"] == "START":
                note = self.spawn(c["target"])
            elif c["type"] == "SHUTDOWN":
                keep_running = False
            else:
                ok, note = False, "unknown command"
            db.run(self.g, "MATCH (c:Command {cmd_id: $id}) SET c.status = $s, c.done_at = $now, c.note = $note",
                   {"id": c["id"], "s": "DONE" if ok else "FAILED", "now": db.now_ms(), "note": note})
        return keep_running

    def shutdown_requested(self) -> bool:
        r = db.one(self.g, "MATCH (s:Control {id: 'global'}) RETURN s.shutdown_at AS t")
        return bool(r and r["t"] and r["t"] >= self.started_at)

    def run(self):
        db.run(self.g, "MERGE (s:Control {id: 'global'}) SET s.supervisor_started = $now", {"now": self.started_at})
        for role, n in self.pool.items():
            for _ in range(n):
                self.spawn(role)
        try:
            while True:
                coord.heartbeat(self.g, ME, "supervisor", "running")
                if not self.handle_commands() or self.shutdown_requested():
                    break
                self.reap_leases()
                self.mark_dead()
                time.sleep(self.tick_s)
        finally:
            for agent_id, p in self.procs.items():
                if p.poll() is None:
                    p.kill()
                    p.wait()
            coord.heartbeat(self.g, ME, "supervisor", "stopped")
            log.info("supervisor stopped")
