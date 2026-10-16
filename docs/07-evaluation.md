# 07 — Evaluation

Goal: credible, honest numbers that show **where the graph helps and where it doesn't**. Judges trust a table that includes failures.

> **As built (Phase 3).** `uv run python -m claimbridge.cli eval all` writes `eval/results/latest.md` and `latest.json`, plus `raw/<system>.json` per system. Steps can be run separately (`eval claimbridge`, `no_memory`, `baseline`, `baseline_strong`, `chaos`, `report`), and recorded LLM answers replay, so a re-run only calls the LLM for what's missing. Code is in `backend/claimbridge/evaluation/`.
>
> Differences from the plan below:
> - **Baseline index:** the baseline's index is its own FalkorDB graph (`<graph>_baseline_<model>`) of `Chunk` nodes with no relationships. The corpus is 74 clause passages from all versions, each with its version dates and the evidence it requires, plus 52 historical case records with facts, evidence and verified outcome.
> - **Embedding models:** `bge-small-en-v1.5` (same as ClaimBridge) for the main comparison, and `mxbai-embed-large-v1` as the large-embedding check.
> - **Scoring:** every system is scored on the same claims. Missing evidence isn't scored when the correct disposition is NO_BASIS_ESCALATE. EV-M-B2 is held out for the memory-gain experiment.
> - **M10 chaos run:** 12 claims, a pool with 2 replicas per role, and 10 hard kills of workers that hold a lease (each one replaced). We count kills that interrupted a step, by matching `RESUMED.previous_owner`.
> - **Not measured:** M1 for the baseline on vague notices separately, and latency. M12 reports tokens per claim from the recorded calls.

## 1. Systems compared

| System | Description |
|---|---|
| **ClaimBridge** | Full pipeline: graph and memory, all 5 agents |
| **ClaimBridge without memory** (ablation) | Same agents, but the Finding/Playbook layer is hidden (Retrieval returns no Findings). This isolates the value of memory. |
| **Baseline RAG** | Same Claude model and same output schema. Retrieval is top-k vector search over chunks of **all** policy versions' clause text plus historical case summaries, stored in a separate FalkorDB graph (`baseline`) with no relationships. The prompt asks for the same JSON: reason, version, required/missing evidence, applicable precedents, disposition, and citations. |

The baseline is a fair, honest effort, not a straw man:
- It gets the service date in its prompt and is told to use the version in force.
- It gets the same denial notice and evidence list.
- Its prompt was tuned once on 5 non-trap examples before the final run.

## 2. Dataset
- About 30 evaluation claims: about 18 traps (T1–T7, 2–3 variants each) and about 12 normal.
- Ground truth comes from the independent rule engine ([03](03-dataset-and-traps.md) §7).
- The run uses `LLM_MODE=cached` after a first live run, so the published numbers are reproducible. The first live run's numbers are also reported.

## 3. Metrics

| # | Metric | Definition | Expectation |
|---|---|---|---|
| M1 | Denial reason accuracy | predicted reason = expected | Both systems high (tests LLM extraction) |
| M2 | Governing version accuracy | predicted version = expected | ClaimBridge 100%, baseline lower |
| M3 | Precedent precision / recall | accepted Findings vs. `expected_applicable_findings` | ClaimBridge much higher precision |
| M4 | Wrong-precedent rate | % of claims where a precedent that should be rejected is used | **The headline trap metric** |
| M5 | Missing-evidence F1 | predicted missing vs. expected missing | |
| M6 | Disposition accuracy | `APPEAL_VIABLE`, `NEEDS_EVIDENCE`, or `NO_BASIS` matches | |
| M7 | Unsupported-recommendation rate | % of output items without a valid citation to a real node/chunk | ClaimBridge 0% by construction. Also report how many items the guard **dropped**. |
| M8 | Stale/contradicted detection | % of T1/T4 claims where the stale or contradicted Finding is flagged | |
| M9 | Tenant leakage | Number of other-tenant case fields exposed (T7) | ClaimBridge 0 |
| M10 | Handoff recovery | Over K kill-injected runs: % completed, mean recovery time, duplicate outputs | 100%, ~TTL seconds, 0 |
| M11 | Memory gain | Disposition accuracy and confidence on the "B" claims, before vs. after the "A" outcome is recorded | Shows claim C1 |
| M12 | Cost and latency | Tokens and seconds per claim | Report honestly. The graph may be cheaper because prompts are smaller. |

## 4. Harness (`backend/eval/`)

```
make eval            # = python -m eval.run_eval --systems claimbridge,no_memory,baseline
```
1. `make reset`, which reseeds the graph deterministically.
2. For each system, inject all evaluation claims and wait until each is AWAITING_REVIEW, NEEDS_HUMAN, or times out.
3. Read predictions from the graph (ClaimBridge) or the JSON output (baseline).
4. `score.py` computes M1–M9 and M12 per claim and in aggregate, plus a per-trap breakdown.
5. `run_eval.py --chaos` runs the M10 kill-injection loop (K = 20 runs).
6. `run_eval.py --memory-gain` runs the A→B sequence for M11.
7. It writes `eval/results/latest.json` and `eval/results/latest.md`. The UI and README both use these.

## 5. Report format (in the README)

| Metric | ClaimBridge | No-memory | Baseline RAG |
|---|---:|---:|---:|
| Version accuracy | … | … | … |
| Wrong-precedent rate ↓ | … | … | … |
| Missing-evidence F1 | … | … | … |
| Disposition accuracy | … | … | … |
| Unsupported recs ↓ | … | … | … |
| Stale/contradiction flagged | … | … | … |
| Tenant leakage ↓ | … | … | … |
| Handoff recovery | … | n/a | n/a |
| Tokens/claim | … | … | … |

Then add:
- **Per-trap table:** pass/fail per system.
- **Failures:** each ClaimBridge failure with a one-line cause (for example, "Intake mis-extracted the reason from a vague notice").
- **Threats to validity:**
  - The data is synthetic.
  - Ground truth comes from rules we wrote.
  - The sample is small.
  - The baseline was tuned only lightly.
  - None of this shows real-world claim outcomes.

## 6. Avoiding the tautology criticism

A judge may ask: "you wrote the rules and the graph, so of course it matches."

Answer, which goes in the README:
1. The rule engine is separate Python code over the YAML, not the Cypher.
2. The interesting failures happen **before** the graph logic: the LLM must extract the right reason and cited clause from messy, sometimes misleading notice text. M1 and the downstream errors measure that.
3. The comparison isn't "graph vs. nothing." It's the same LLM with or without structured, versioned, self-revising memory. The no-memory ablation separates the two effects.
4. In traps, the most text-similar precedent is the wrong one. That's checked automatically, so a baseline can't pass by luck.

## 7. Day-by-day evaluation milestones
- **Day 1:** ground truth generated, and the trap self-check passes.
- **Day 2:** first full table (even if ugly), and the baseline works.
- **Day 3, morning:** fix the cheap ClaimBridge failures **without** touching ground truth, rerun, freeze the numbers, and record the cached replay.
