# 08 — Demo, Pitch, and Submission

## 1. The pitch

**Tagline:** *An AI caseworker that remembers verified resolutions, knows when prior knowledge no longer applies, and explains every recommendation through its evidence graph.*

**30-second version:**
> When a health claim is denied, the answer depends on which policy version applied, which clause was cited, what evidence exists, and what happened in similar cases. Vector RAG finds the case that *looks* closest and reuses it, even when the policy changed or the old win depended on a condition this claim doesn't meet. ClaimBridge stores that reasoning in FalkorDB: versioned clauses, verified outcomes distilled into Findings, and the conditions and versions under which they hold. Five agents coordinate only through the graph, so any one can crash and another resumes. Every recommendation is a graph path a human can inspect and approve.

**What we don't claim:** that it approves claims, gives legal advice, or has been tested on real insurer data.

## 2. Demo video script (target 3:30, hard max 4:00)

Record with `STEP_DELAY_S=2` and `LLM_MODE=cached`. Do one rehearsal with live mode to confirm it also works live, and say so in the video.

| Time | Screen | Narration (summary) | Proves |
|---|---|---|---|
| 0:00–0:20 | Title, then the inbox | The problem in one sentence: denied claims, outdated precedent, lost context. | — |
| 0:20–0:40 | FalkorDB browser: schema view | Three layers: knowledge (versioned clauses), cases, memory (Findings). Agents share only this graph. | Graph is central |
| 0:40–1:20 | Inject **T1** (MRI 2026 with referral). The card moves through the lanes. Open case detail. | "The nearest past case won with a referral. ClaimBridge rejects it: the Finding was learned on the 2025 clause, and the 2026 clause removed the referral exception." Highlight the red edge `VERSION_DRIFT → C-2026-MRI-PREAUTH`. Show the checklist with citation chips. | C2, C4 |
| 1:20–1:45 | Same claim in the baseline output (evaluation page or a side-by-side) | "Baseline RAG reuses the 2025 win and promises an overturn." | C5 |
| 1:45–2:20 | Inject **T5**. On the Ops page, **kill verifier-1** mid-step. The timeline shows `LEASE_EXPIRED`, then `RESUMED by verifier-2 (attempt 2)`. | "No session memory to lose. The lease expired, and another verifier resumed from the graph checkpoint. The rejected precedent is `CONDITION_UNMET: not an emergency`." | C3 |
| 2:20–2:55 | Memory page. Approve claim A and record OVERTURNED. The Finding updates. Inject claim B, which now uses the Finding with higher confidence. Then **Publish 2026 policy** on a fresh reset and watch F-MRI-REFERRAL turn STALE. | "Memory improves the next decision, and it knows when it stops being true." | C1, C2 |
| 2:55–3:10 | T7: try to open another tenant's precedent | Only the anonymized Finding and outcome are shown. | C6 |
| 3:10–3:30 | Evaluation table | Headline numbers, plus one honest failure. "Synthetic data; human approval required." Show the repo link. | Credibility |

**Recording tips:**
- 1080p, with the browser zoomed to 110–125%.
- No dead air while waiting. Cut it, or narrate over it.
- Record each segment separately and splice.
- Add captions, because judges often watch muted.

## 3. Submission checklist (from the official rules)

- [ ] **Public repository** (GitHub), with a license (MIT) and the repo description set
- [ ] **README.md** containing:
  - [ ] the one-line pitch and a 3-sentence problem statement
  - [ ] **track(s) entered**: Track 02 Agent Memory and Coordination (optionally also Track 01)
  - [ ] architecture diagram
  - [ ] **graph data model** (diagram and node/relationship table, from [02](02-data-model.md))
  - [ ] **Cypher queries the product depends on** (from [05](05-cypher-queries.md), or a link to `docs/queries.md` in the repo)
  - [ ] setup: prerequisites, `.env`, `docker compose up`, `make seed`, `make eval`
  - [ ] live deployment URL and demo video link
  - [ ] evaluation results table, failures, and threats to validity
  - [ ] **AI-assistance disclosure**: which tools were used, what for, and what the team wrote, verified, or decided itself
  - [ ] data statement: all synthetic and fictional
  - [ ] limitations and next steps
- [ ] **Demo video** (YouTube unlisted or Loom), showing the working project
- [ ] **Live deployment** reachable from a fresh browser (or complete local setup if deployment fails)
- [ ] The team can each explain the graph model, the key queries (Q4, Q6, Q7, Q8), and the architecture without notes
- [ ] Submitted on the WeMakeDevs page **by 9:00 PM IST, Oct 18** (hard deadline 11:59 PM IST)

### AI disclosure template
> We used Claude Code as a coding assistant for scaffolding, boilerplate, and drafting tests and docs. The graph model, trap design, agent coordination protocol (leases, fencing, checkpoints), and evaluation method were designed and reviewed by the team. We read, ran, and verified all code. At runtime, the product uses Claude models for text extraction and wording only. Decisions are made by Cypher queries over FalkorDB.

Edit this so it is exactly true for your team.

## 4. Judge Q&A prep

| Likely question | Short answer |
|---|---|
| Why not just vector RAG? | Versions, conditions, and contradictions are relationships. Q4 decides applicability in one traversal, and the evaluation shows the RAG baseline reusing invalid precedent. |
| Does it work without FalkorDB? | No. Version selection, applicability, evidence gaps, memory, leases, and checkpoints all live in the graph. |
| What if the LLM hallucinates? | It only extracts and phrases text. The citation guard drops any uncited item, so unsupported recommendations are 0%. |
| How is memory kept safe across tenants? | Findings are built from structured fields only and have no tenant edges. Case reads anchor on the tenant (Q11). |
| How do you avoid a stale Finding being reused? | `VALID_IN` scoping, plus Q6 propagation on a new version, plus `CONTRADICTED_BY` from verified outcomes. |
| What's the concurrency model? | Atomic lease claim (Q7), heartbeats (Q7b), and a fenced commit (Q8). Shown live with a kill. |
| Isn't the evaluation circular? | See [07](07-evaluation.md) §6: the independent rule engine, LLM extraction as the real failure point, and the no-memory ablation. |
| Real-world use? | A caseworker or patient-advocate assistant with a human in the loop. A real deployment needs authorization, audit, and privacy controls. |

## 5. Blog post (side prize, optional)

**Title idea:** "Your agent's memory should know when it's wrong: versioned, self-revising memory with FalkorDB"

**Outline:**
1. The failure: RAG reusing a precedent from an outdated policy.
2. The model: lineage, `VALID_IN`, `CONTRADICTED_BY`, and `STALE_BECAUSE`.
3. Q4 and Q6 explained.
4. Coordination through the graph: leases, fencing, and checkpoints.
5. The results table, failures included.
6. What we'd do next.

Publish it on Hashnode or dev.to, then link it in the submission and the README. Write it only after the submission is in.

## 6. Final-day run sheet (Sat Oct 18, IST)

| Time | Action |
|---|---|
| 09:00 | Final evaluation run, freeze numbers |
| 11:00 | Deploy; test the live URL on a phone and another laptop |
| 13:00 | Feature freeze (bug fixes only after this) |
| 13:00–16:00 | README, diagrams, query doc, AI disclosure |
| 16:00–18:30 | Record and edit the video |
| 18:30–20:00 | Dry-run the full submission form and fix links |
| **20:00–21:00** | **Submit** |
| 21:00–23:59 | Buffer, then the blog post |
