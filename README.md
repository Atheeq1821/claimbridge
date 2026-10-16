# ClaimBridge

An AI caseworker for denied health-insurance claims. It remembers verified resolutions, knows when prior knowledge no longer applies, and explains every recommendation through its evidence graph on **FalkorDB**.

Built for *Graph Hacks: Context for AI Agents* (WeMakeDevs × FalkorDB), **Track 02: Agent Memory and Coordination**.

> Status: Phases 1–3 complete (agent spine, full agent loop and memory, evaluation). See [docs/09-phases.md](docs/09-phases.md) and [eval/results/latest.md](eval/results/latest.md).
> All data is synthetic and fictional. Recommendations require human approval.

## Quick start

Prerequisites: Docker and [uv](https://docs.astral.sh/uv/). For live LLM calls you also need a free [Groq](https://console.groq.com) API key; recorded responses in `data/llm_cache/` replay without one.

```bash
cp .env.example .env                          # add GROQ_API_KEY (or set LLM_PLATFORM=openai|claude)
docker compose up -d falkordb                 # FalkorDB on :6379, browser on :3000
cd backend && uv sync

uv run python -m claimbridge.cli run all      # 35 evaluation claims through the agent pool
uv run python -m claimbridge.cli show EV-T1-01
uv run python -m claimbridge.cli gate2        # memory gain, contradiction, kill/resume, staleness
uv run python -m claimbridge.cli eval all     # vs. no-memory and plain vector RAG -> eval/results/latest.md
uv run pytest -q                              # offline (fake LLM)
```

## Results (synthetic data; see [eval/results/latest.md](eval/results/latest.md))

34 evaluation claims. Every system uses the same LLM and the same documents; only graph reasoning differs.

| | ClaimBridge | Plain vector RAG | Plain RAG, large embeddings |
|---|---:|---:|---:|
| Claims fully correct | **100%** | 65% | 65% |
| Disposition accuracy | **100%** | 79% | 76% |
| Claims reusing a precedent that doesn't apply | **0%** | 15% | 15% |
| Stale or contradicted precedent avoided | **100%** | 56% | 56% |
| Other-tenant case fields exposed | **0** | 9 | 15 |

A much larger embedding model (`mxbai-embed-large`, 1024-dim, vs. `bge-small`, 384-dim) didn't fix the baseline's mistakes; they're reasoning errors about policy versions, conditions and contradictions, not retrieval misses. Under random worker kills, every interrupted step was resumed by another worker, with no duplicate work.

To run the whole stack in containers:

```bash
docker compose --profile agents up -d --build
```

## How it works

```
RECEIVED -Intake-> CLASSIFIED -Retrieval-> RETRIEVED -Verifier-> VERIFIED -Planner-> AWAITING_REVIEW
   -> human approves -> real outcome recorded -> VERIFIED_OUTCOME -Curator-> CURATED (memory updated)
```

- **Agents coordinate only through the graph.** Each agent is a separate process. It leases a claim with one atomic Cypher write, reads what it needs, writes its result, and commits with a fenced query. If a worker dies, its lease expires and another replica resumes from the checkpoint in the graph. The Supervisor runs the pool and records expired leases. Its control commands (kill, start, shutdown) are graph nodes too.
- **The graph decides, and the LLM writes.** The Verifier decides in Cypher whether each precedent applies, and records why one doesn't:
  - `VERSION_DRIFT`: learned under a clause that the governing policy version superseded
  - `LINEAGE_MISMATCH`: same denial reason, but a different clause
  - `CONTRADICTED`: later verified cases disagreed
  - `CONDITION_UNMET`: for example, the precedent needed an emergency

  The Planner's disposition and evidence checklist come from the graph. The LLM only writes the wording, and a citation guard drops any item that doesn't cite nodes the graph returned.
- **Memory that knows when it's wrong.** Verified wins create or strengthen Findings, verified losses contradict them, and publishing a new policy version marks dependent Findings stale.

LLM providers are switchable with `LLM_PLATFORM` (`groq` default with `openai/gpt-oss-120b`, plus `openai`, `claude` and `fake`).

Design docs: [docs/](docs/README.md). Data model: [docs/02-data-model.md](docs/02-data-model.md). Cypher queries: [docs/05-cypher-queries.md](docs/05-cypher-queries.md).

## AI assistance

This project is built with Claude Code as a coding assistant. The full disclosure will be completed for submission (see [docs/08-demo-and-submission.md](docs/08-demo-and-submission.md)).
