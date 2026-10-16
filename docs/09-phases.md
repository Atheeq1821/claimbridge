# 09 — Phases and Status

| Phase | Name | Target | Exit gate | Status |
|---|---|---|---|---|
| **1** | Foundation and spine | Thu Oct 16 | T1 runs end to end across separate processes with correct rejection | ✅ **Done** |
| 2 | Full agent loop and memory | Fri Oct 17, morning | Plan → approve → learn → stale → contradict. Kill-and-resume through the Supervisor. | ✅ **Done** |
| 3 | Evaluation | Fri Oct 17, afternoon | `make eval` prints ClaimBridge vs. no-memory vs. baseline RAG, failures included | Next |
| 4 | API and UI | Fri evening to Sat morning | Every demo step can be clicked through live | |
| 5 | Deploy and harden | Sat Oct 18, morning | Live URL works from a phone. Feature freeze at 1:00 PM IST. | |
| 6 | Docs, video, submit | Sat Oct 18, afternoon | Submitted by 9:00 PM IST | |

---

## Phase 1 — Foundation and spine ✅

### Deliverables

| # | Deliverable | Where | Result |
|---|---|---|---|
| 1.1 | Repo scaffold, Compose, Makefile, `.env.example` | `docker-compose.yml`, `Makefile`, `backend/pyproject.toml` | `docker compose up -d falkordb`; the `agents` profile runs workers in containers |
| 1.2 | Schema: 21 range indexes and 2 vector indexes | `claimbridge/schema.py` | FalkorDB 4.22 syntax verified |
| 1.3 | Knowledge YAML: 3 versions, 25 lineages (7 change), taxonomies, 10 playbooks, 15 seed Findings | `data/knowledge/` | 74 Clause nodes after expansion |
| 1.4 | Case generator and independent rule engine | `claimbridge/seed/generate.py`, `rules.py`, `notices.py` | 52 historical and 32 evaluation claims (19 traps), deterministic |
| 1.5 | Seed loader | `claimbridge/seed/load.py` | `make reset` takes about 20 seconds (about 500 nodes before any agent runs) |
| 1.6 | Graph tools: Q1, Q2, Q2a, Q2b, Q3, Q4, Q4b, Q5, Q7, Q7b, Q8 | `claimbridge/tools/` | All tested |
| 1.7 | Worker framework: lease, resume, fenced commit, heartbeat, simulated crash | `claimbridge/agents/base.py` | Crash and resume proven |
| 1.8 | Intake, Retrieval and Verifier agents (no LLM yet) | `claimbridge/agents/` | 31/32 claims correct |

### Measured results

- **Pipeline accuracy:** 31/32 evaluation claims match ground truth on version, reason, cited clause, accepted precedents, rejected precedents with codes, gates and missing evidence. This holds with agents as local processes and as Docker containers.
  - The single miss is **EV-N-11**, the deliberately misleading notice. Intake flags it `needs_llm_review`, and Phase 2's Claude extraction targets it.
- **Trap behaviour:** all 17 T1–T6 traps are handled correctly (T7 is checked at the API in Phase 4).
- **Trap self-check:** nearest-neighbour reuse gives the wrong answer on **12/17** traps.
- **Lease atomicity:** 16 parallel claimers × 40 trials always gave exactly 1 winner.
- **Crash and resume:** verifier-1 is killed (`os._exit(137)`) after its applicability pass. Its lease expires, and verifier-2 resumes at attempt 2, reuses the checkpoint, skips the applicability pass, and gives the correct result.
- **Load balancing:** with 2 intake containers, the 32 claims split 16/16 with no coordination beyond the graph.
- **Tests:** `uv run pytest` gives **21 passed**.

### Changes from the original plan
- Clauses live in a single `lineages.yaml` with per-version bodies, instead of one file per version.
- Seed Findings are authored as specs (`findings.yaml`), and the historical cases are generated to support or contradict them. `VALID_IN` is computed from clause params.
- Denial notices come from deterministic templates, not an LLM, so the dataset is exactly reproducible.
- Notice embeddings use only the core text, because the letter boilerplate dominated similarity.
- Checkpoints are one node per step via `HAS_CHECKPOINT`, with a `complete` flag, instead of a `LATEST_CHECKPOINT`/`PREVIOUS` chain.
- `REASON_MISMATCH` was added to Q4 for vector-only candidates.
- Q5 excludes playbook evidence (guidance, not requirements).
- Clause-level gates (`EXCLUSION_NO_BASIS`, `EMERGENCY_REQUIRED`, `FILED_LATE`, `WAITING_NOT_MET`) were added, so "no basis" doesn't depend on precedent.

### How to reproduce
```bash
docker compose up -d falkordb
cd backend && uv sync
uv run python -m claimbridge.cli gate        # Phase 1 gate (traps + crash/resume)
uv run python -m claimbridge.cli run all     # all 32 evaluation claims
uv run python -m claimbridge.cli show EV-T1-01
uv run python -m claimbridge.cli selfcheck
uv run pytest -q
```

---

## Phase 2 — Full agent loop and memory ✅

### Deliverables

| # | Deliverable | Where | Result |
|---|---|---|---|
| 2.1 | Provider-agnostic LLM layer with structured outputs and a recorded-response cache | `claimbridge/llm/` | `LLM_PLATFORM` = `groq` (default), `openai`, `claude` or `fake`. Recordings are kept under `data/llm_cache/`. |
| 2.2 | Intake: LLM classification for notices that don't cite a section | `agents/intake.py` | EV-N-11 (misleading notice) now correct |
| 2.3 | Planner: deterministic disposition, LLM wording, citation guard | `agents/planner.py`, `guard.py`, `tools/recommendation.py` | Every item cites graph nodes |
| 2.4 | Curator mode A: learn, strengthen, contradict, playbook usage | `agents/curator.py`, `tools/memory.py` | Memory gain shown |
| 2.5 | Curator mode B: publish a policy version, then Q6 staleness | `publish_version`, `reset --upto` | Exactly the changed-lineage Findings go stale |
| 2.6 | Supervisor: worker pool, KILL/START/SHUTDOWN commands via the graph, lease reaper, human gate | `supervisor.py` | Kill and resume shown |

### LLM choice: Groq `openai/gpt-oss-120b`
Groq's free tier was chosen for now. Only four Groq models support **strict** JSON-schema output (constrained decoding): `gpt-oss-20b`, `gpt-oss-120b`, `qwen3.8-27b` and `muse-spark-open`. `gpt-oss-120b` is the strongest production one, with 131k context and reasoning-effort control. Intake uses `low` effort and the Planner uses `medium`.

Groq is OpenAI-compatible, so it shares the OpenAI provider code with a different base URL. Claude uses the Anthropic SDK's `messages.parse`. Switching providers is a single env variable, `LLM_PLATFORM`.

### Measured results (`cli gate2`, Groq gpt-oss-120b)
- **Accuracy:** **35/35** evaluation claims match ground truth on version, reason, clause, accepted and rejected precedents, gates, missing evidence and disposition. Every recommendation item cites graph nodes.
- **Citation guard:** 33 recommendations with 148 items, all drafted by the LLM. In this run the guard had nothing to drop or add, because gpt-oss stayed inside `ALLOWED_IDS`. The guard's behaviour on bad drafts is covered by unit tests: uncited, unknown-ID and promise-of-approval items are dropped, and missing required items are added.
- **Memory gain:** EV-M-B1, processed before learning, had no precedent and confidence 0.4. After EV-M-A was approved and recorded OVERTURNED, the Curator learned `F-L-AMBULANCE-1`, valid in 2024–2026. EV-M-B2, with the same facts, then accepted that precedent at confidence 1.0, with the note "only 1 verified case".
- **Contradiction:** EV-N-04's appeal was recorded UPHELD, so F-ER-NECESSITY's confidence went from 1.0 to 0.5. It stays ACTIVE (2 wins, 1 contradiction).
- **Supervisor kill:** the Supervisor killed `verifier-2` while it held EV-T4-02. It then recorded `LEASE_EXPIRED`, `verifier-1` resumed the claim, and the result was correct.
- **Staleness:** publishing 2026 into the 2025 world turned F-MRI-REFERRAL, F-OON-ER, F-PHYSIO-NOTES and F-TIMELY-180 STALE (`STALE_BECAUSE` the new clause). The other 9 Findings carried forward.
- **Tests:** `uv run pytest` gives **30 passed**, using the deterministic `fake` LLM with no network.

### Changes from the plan
- The Planner moves claims straight to AWAITING_REVIEW. `PLANNED` is not used as a separate state.
- Disposition and confidence are deterministic. Confidence is 0.9 for a clause gate, the best accepted precedent's confidence if there is one, and 0.4 otherwise. The LLM only writes wording.
- Seed Findings are restricted to what was knowable in the loaded world (`reset --upto`).
- Control commands (KILL, START, SHUTDOWN) are nodes in the graph, so even operations go through the shared state. Workers also stop when `Control.shutdown_at` is set. This matters on Windows, where killing a parent process doesn't kill its children.
- Claude refusal fallbacks (server-side `fallbacks`) are not enabled yet, because the Claude path hasn't been run against the live API in this project.

### How to reproduce
```bash
uv run python -m claimbridge.cli gate2          # everything above
uv run python -m claimbridge.cli up             # supervised pool (foreground); `down` to stop
uv run python -m claimbridge.cli inject EV-T1-01 && uv run python -m claimbridge.cli show EV-T1-01
uv run python -m claimbridge.cli approve EV-M-A && uv run python -m claimbridge.cli outcome EV-M-A OVERTURNED
uv run python -m claimbridge.cli kill verifier-1
uv run python -m claimbridge.cli reset --upto V2025 && uv run python -m claimbridge.cli publish V2026
```

---

## Phase 3 — Evaluation (next)

| # | Deliverable | Exit criterion |
|---|---|---|
| 3.1 | Baseline RAG: same LLM, vector top-k over all policy text and case summaries, in a separate graph with no relationships | Runs on all 35 claims |
| 3.2 | No-memory ablation (Findings hidden) | Runs on all 35 claims |
| 3.3 | `make eval`: metrics M1–M12 from docs/07, per-trap table, failures | Results table in `eval/results/latest.md` |
