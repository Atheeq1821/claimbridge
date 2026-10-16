"""Evidence gap (Planner)."""
from claimbridge import db


def evidence_gap(g, cid: str) -> list[dict]:
    """Q5: evidence required by the cited clause and by accepted Findings, and whether
    the claim already has it."""
    return db.run(g, """
        MATCH (c:Claim {claim_id: $cid})-[:HAS_NOTICE]->(:DenialNotice)-[:CITES]->(cl:Clause)
        OPTIONAL MATCH (cl)-[:REQUIRES]->(e1:EvidenceType)
        WITH c, collect(DISTINCT e1) AS r1
        OPTIONAL MATCH (c)-[:CONSIDERED {verdict: 'ACCEPTED'}]->(:Finding)-[:NEEDS_EVIDENCE]->(e2:EvidenceType)
        WITH c, r1, collect(DISTINCT e2) AS r2
        UNWIND r1 + r2 AS e
        WITH DISTINCT c, e
        OPTIONAL MATCH (c)-[:HAS_EVIDENCE]->(ev:Evidence)-[:OF_TYPE]->(e)
        WITH e, count(ev) AS have
        RETURN e.code AS evidence, e.name AS name, have > 0 AS satisfied
        ORDER BY satisfied, evidence
    """, {"cid": cid})


def missing_evidence(g, cid: str) -> list[str]:
    return sorted(r["evidence"] for r in evidence_gap(g, cid) if not r["satisfied"])
