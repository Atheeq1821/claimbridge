"""Citation guard: nothing uncited leaves the system.

The LLM drafts plan items; this module keeps only items whose citations are nodes
the graph actually returned for this claim, removes promises of approval, and adds
deterministic items for anything required that the draft left out.
"""
import re

PROMISE = re.compile(r"\b(guarantee[sd]?|will (definitely |certainly )?be (approved|paid|overturned|covered))\b",
                     re.I)


GATE_TEXT = {
    "EXCLUSION_NO_BASIS": "the governing clause excludes this service",
    "EMERGENCY_REQUIRED": "out-of-network care is covered only in emergencies, and this was not one",
    "FILED_LATE": "the claim was filed after the limit in force on the service date",
    "WAITING_NOT_MET": "the member had not completed the waiting period in force on the service date",
}


def no_basis_summary(ctx: dict) -> str:
    reasons = "; ".join(GATE_TEXT.get(g, g.replace("_", " ").lower()) for g in ctx["gates"])
    return (f"No appeal basis under §{ctx['clause']['section']} {ctx['clause']['title']}: {reasons}. "
            "Escalate to a human reviewer rather than gathering evidence.")


def apply(draft_items: list[dict], ctx: dict, allowed: dict[str, str], disposition: str) -> tuple[list[dict], dict]:
    kept, stats = [], {"drafted": len(draft_items), "dropped_uncited": 0, "dropped_unknown_id": 0,
                       "dropped_promise": 0, "dropped_moot": 0, "added_required": 0}
    no_basis = disposition == "NO_BASIS_ESCALATE"
    for it in draft_items:
        # With no basis for appeal, steps to gather evidence or file an appeal contradict the holding.
        if no_basis and it["kind"] in ("EVIDENCE_NEEDED", "ACTION"):
            stats["dropped_moot"] += 1
            continue
        cites = list(dict.fromkeys(it["cite_ids"]))
        if not cites:
            stats["dropped_uncited"] += 1
            continue
        if any(c not in allowed for c in cites):
            stats["dropped_unknown_id"] += 1
            continue
        if PROMISE.search(it["text"]):
            stats["dropped_promise"] += 1
            continue
        kept.append({**it, "cite_ids": cites, "origin": "llm"})

    def cited(kind: str, node_id: str) -> bool:
        return any(i["kind"] == kind and node_id in i["cite_ids"] for i in kept)

    clause = ctx["clause"]
    if no_basis:
        if not any(i["kind"] == "WARNING" for i in kept):
            kept.insert(0, {"kind": "WARNING", "origin": "template", "cite_ids": [clause["clause_id"]],
                            "text": no_basis_summary(ctx)})
            stats["added_required"] += 1
        kept.append({"kind": "ACTION", "origin": "template", "cite_ids": [clause["clause_id"]],
                     "text": "Escalate to a human reviewer: the governing terms leave no basis for an appeal."})
        stats["added_required"] += 1
    for e in ctx["evidence"]:
        if no_basis:
            break
        if not e["satisfied"] and not cited("EVIDENCE_NEEDED", e["code"]):
            kept.append({"kind": "EVIDENCE_NEEDED", "origin": "template",
                         "cite_ids": [e["code"], clause["clause_id"]],
                         "text": f"Obtain and submit the {e['name'].lower()}."})
            stats["added_required"] += 1
    for r in ctx["rejected_precedents"]:
        if not cited("REJECTED_PRECEDENT", r["finding_id"]):
            why = {"VERSION_DRIFT": f"it was learned under {r['learned_on']}, but {r['governing']} governs this claim",
                   "LINEAGE_MISMATCH": "it concerns a different policy clause",
                   "CONTRADICTED": "later verified cases with the same facts were upheld",
                   "CONDITION_UNMET": "it only applies when its conditions (such as an emergency) are met"
                   }.get(r["code"], r["code"])
            cites = [r["finding_id"]] + [x for x in (r["governing"],) if x and r["code"] == "VERSION_DRIFT"]
            kept.append({"kind": "REJECTED_PRECEDENT", "origin": "template", "cite_ids": cites,
                         "text": f"Do not rely on precedent {r['finding_id']}: {why}."})
            stats["added_required"] += 1
    stats["kept_llm"] = sum(1 for i in kept if i["origin"] == "llm")
    return kept, stats
