# ClaimBridge

A review workspace for denied health-insurance claims, with versioned memory and five workers coordinating through **FalkorDB**. A past win can inform the next checklist, but only when its policy version, clause and conditions still apply.

Built for **Graph Hacks — Track 02: Agent Memory and Coordination**. All insurers, policies, people and outcomes are fictional. This is a bounded research prototype, not a coverage decision service.

## Run locally

Prerequisites: Docker Desktop with Compose, internet for the first image/model download, and about 6 GB of free RAM. Ports 3100, 8000, 6379 and 3000 must be free; every one is bound to localhost and can be moved with `WEB_PORT`, `API_PORT`, `DB_PORT`, `DB_UI_PORT` in `.env`. The database image is pinned (FalkorDB 4.22.1), the version every test and result here ran on.

```bash
cp .env.example .env
docker compose --profile app up -d --build
```

PowerShell: use `Copy-Item .env.example .env`. Open **http://localhost:3100**, then **Open console**. FalkorDB Browser: http://localhost:3000. API docs: http://localhost:8000/docs.

Bundled synthetic notices replay recorded Groq responses. Set `GROQ_API_KEY` in `.env` to classify new notices. With no matching recording and no provider, intake asks for human review; it does not guess from similarity. The planner publishes graph templates without an LLM call. `PLANNER_DRAFT_AUDIT=1` optionally audits model drafts without publishing arbitrary model prose.

**Demo mode is deliberately public:** every visitor can inspect fictional cases and exercise operator controls. Do not load private records. Compose startup runs a seed service that resets the configured demo graph. To stop without removing data: `docker compose --profile app down`.

Troubleshooting: `docker compose --profile app logs --tail=80 seed api agents web`. The first seed downloads an embedding model and can take several minutes. Rebuild only the UI without resetting: `docker compose --profile app up -d --build --no-deps web`.

## Try the core claims

1. File **T1** from the Docket. Open `EV-T1-01`: the 2025 MRI precedent is rejected because the 2026 clause governs. Inspect the graph, citations and agent record.
2. File `EV-M-B1` and `EV-M-A` individually. Open A, approve for review, record **OVERTURNED**, and confirm **Emergency attestation + Itemized bill** were used. Wait for CURATED. Then file `EV-M-B2`: its checklist asks the reviewer about the missing bill and cites the learned Finding. After one observed win, support is 0.667, not an approval probability.
3. In Memory, rewind to 2025 and publish 2026. Changed clause fingerprints invalidate dependent memory; unchanged clauses carry forward. Rewind resets the demo graph.
4. File a group, open Agents and kill a worker while it holds a lease. Its replacement resumes from graph state. The evaluation also runs reproducible fault injection.
5. Download a **review packet** from a completed case: cited plan, clause, precedent decisions, uncertainty and audit events. Approval and download do not submit anything to an insurer.
6. Click **New claim** on the Docket, pick *Insert* for a sample notice and **File and watch**: the graph replay plays as the agents work your claim. Change the section number to one that does not exist and file again: Intake stops and says why instead of guessing.
7. On any precedent in a case, choose **Show the path through the graph**: the edges it needs are checked one by one and the first broken one is marked. On Memory, **What rests on a clause** traverses a clause, its precedents, their evidence and the claims that weighed them. It is sparse on a fresh graph: on the Docket, use *File a group* (Normal, then each trap group, but not the `EV-M-*` memory pair) first, so every lineage has claims on it.
8. On a claim that needs a person, choose the denial reason and give a reason: the original notice stays untouched, the claim resumes at Retrieval and nothing computed before is kept. In **Evidence**, declare a document on file: the plan is withdrawn and re-checked. A document is *declared, never verified*.

## Architecture and graph model

```mermaid
flowchart LR
  UI[Next.js review console] --> API[FastAPI tenant boundary]
  API --> G[(FalkorDB)]
  I[Intake: classification] --> G
  R[Retrieval: candidate findings] --> G
  V[Verifier: applicability and gates] --> G
  P[Planner: graph templates] --> G
  C[Curator: outcome memory] --> G
  S[Supervisor: leases and recovery] --> G
```

```mermaid
flowchart LR
  Claim -->|GOVERNED_BY| PolicyVersion
  PolicyVersion -->|CONTAINS| Clause
  Clause -->|SUPERSEDES| OlderClause[Earlier clause]
  Claim -->|CONSIDERED: verdict and reason| Finding
  Finding -->|VALID_IN| PolicyVersion
  Finding -->|ON_LINEAGE| Clause
  Finding -->|NEEDS_EVIDENCE| EvidenceType
  Finding -->|DERIVED_FROM / CONTRADICTED_BY| Resolution
  Finding -->|RECOMMENDS| Playbook
  Claim -->|HAS_EVENT / HAS_CHECKPOINT| Audit[Events and checkpoints]
```

The graph selects the service-date policy, evaluates applicability, computes evidence gaps, stores memory, claims leases and fences writes. Removing FalkorDB prevents the pipeline from operating. The five roles are bounded workflow workers; they do not negotiate or choose arbitrary tools.

**Executable queries:** [verification](backend/claimbridge/tools/applicability.py), [evidence and sources](backend/claimbridge/tools/evidence.py), [memory and invalidation](backend/claimbridge/tools/memory.py), [leases and checkpoints](backend/claimbridge/tools/coordination.py), [tenant precedents](backend/claimbridge/tools/tenancy.py). See the [query walkthrough](docs/05-cypher-queries.md) and [full model](docs/02-data-model.md).

## Verification and evaluation

```bash
docker compose up -d falkordb
cd backend && uv sync --frozen && uv run pytest -q          # real FalkorDB, fake LLM
cd ../web && npm install && npm run lint && npx tsc --noEmit && npm test
node scripts/browser-smoke.mjs                              # real Chrome: drives the running demo stack
node scripts/access-matrix.mjs                              # real Chrome: its OWN isolated protected stack
```

Tests use `claimbridge_test`, real FalkorDB and a fake LLM. They cover applicability, races, a living worker paused past its lease, a Curator interrupted after every statement, a policy published mid-flight, credential and tenant boundaries over real HTTP, the event stream's lifetime, intake escalation, memory under duplicate and contradicting outcomes, the human correction and evidence flows, and the evaluation's own bookkeeping. The access matrix signs in, reloads, signs out, switches identity and revokes a credential in a real browser. CI runs backend tests, frontend lint, type checking, unit tests and a production build; it has not been run on a remote runner from this workspace.

Reproduce the benchmark from `backend` with `GRAPH=claimbridge_eval uv run python -m claimbridge.cli eval all --label <name>` (the CLI refuses the demo graph, because an evaluation resets its graph). Every run is its own directory in `eval/runs/<run_id>/` with its code, data and prompt digests, model, cache policy, timestamps, a per-call ledger and never-overwritten raw predictions; a run whose code changed mid-run is marked invalid, and `eval promote --run <id>` refuses one. The promoted run is [eval/results/latest.md](eval/results/latest.md), with [raw predictions](eval/results/raw) and a link from each number to its evidence on the console's Evaluation page. `LLM_MODE=offline` replays recordings; `cached` calls the provider on misses; a fresh live run can differ. The provider's free daily token limit can leave outputs missing; they stay in the denominator with their cause listed.

Read **decision correctness** separately from precedent recall: the no-memory ablation cannot name findings by design, so where decision correctness is equal, memory adds precedents and a changed checklist, not a measured gain in decisions. RAG baselines filter other tenants' raw records before prompting, so some expected precedents are out of their reach; a *reachable-recall* row accounts for that. Structured rules, curated memory, retrieval and prompts all differ; this comparison does **not** establish that a graph database alone causes an accuracy gain, and the information-parity comparison (*RAG + findings*) is described in [docs/07](docs/07-evaluation.md). There are 34 authored synthetic cases plus a separate memory intervention, with expected answers from a separately implemented rule engine by the same team (not external validation), and a small pre-registered unseen-case set (`data/scenarios/generalization.yaml`) that the AI assistant wrote and that is **not independent**; a template for a teammate's independent set is alongside it.

For frontend development: `cd web`, `npm install`, `npm run dev`. Start the API with `uv run uvicorn claimbridge.api:app --port 8000` and workers with `uv run python -m claimbridge.cli up` in separate backend terminals after seeding.

## Access modes

For a private instance set `AUTH_MODE=protected` and `AUTH_CREDENTIALS_JSON` to a JSON object mapping random tokens (32+ characters) to identities. Shape, with placeholders:

```json
{"REPLACE_WITH_RANDOM_ADMIN_TOKEN":{"subject":"operator","role":"admin"},"REPLACE_WITH_RANDOM_TENANT_TOKEN":{"subject":"reviewer-1","role":"tenant","tenant_id":"TEN-01"}}
```

The console uses an HttpOnly, SameSite Strict cookie scoped to `/api`. API clients can use `Authorization: Bearer TOKEN`. Tenant identity comes from credentials, never `X-Tenant-Id`. Operators alone record outcomes, reclassify a notice, withdraw a document, reset/publish policies and control workers; a policyholder can declare a document on its own claim. Tenant scoping covers lists, claims, graphs, packets, evidence and events. Cookie mutations require the console's custom header. Set `COOKIE_SECURE=1` behind HTTPS (and put a reverse proxy in front; the default bindings are localhost only). Invalid protected configuration fails closed. The live event stream re-checks its credential on every poll and ends when it is revoked or after 8 hours; every response names its subject, so a cookie changed in another tab cannot leave one identity's data under another's banner. Shared with everyone signed in: the abstract memory and aggregate counts. Private to a tenant: its cases, notices, evidence, corrections, packets and events.

This is prototype access control. Production needs managed identity, rate limiting, rotation/revocation operations, encrypted storage, retention controls and independent security/privacy review. Shared findings reveal aggregate patterns; they are not a formal anonymization guarantee.

## Limits and AI assistance

The model covers one fictional plan and fixed denial/evidence taxonomies. It does not ingest arbitrary PDFs, OCR evidence, **verify documents** (a declared document is only declared), contact insurers or estimate an appeal's chance of success. A notice from another insurer, a section number the rest of the letter contradicts, an unknown reason or a nonexistent section goes to a person instead of being guessed; an adversarial notice written to pass those checks is not ruled out. Outcome support is not calibrated. A learned checklist item is an observed association requiring review. Unmodeled policy changes require a human to update the knowledge source.

Development used **Claude Code** (reported in the original README) and **OpenAI Codex** for implementation, review, tests and documentation. Codex also revised evaluation and submission materials. Runtime AI defaults to Groq `openai/gpt-oss-120b` for notice classification; published advice uses graph templates. Automated checks are not a claim that participants personally authored or reviewed every line. Team members must describe their actual contributions and demonstrate understanding.

See the [submission guide](docs/08-demo-and-submission.md) and [review changes](docs/10-review-changes.md). Public source access and a hosted working-project video must be verified before submission. Local setup is the deployment fallback.

