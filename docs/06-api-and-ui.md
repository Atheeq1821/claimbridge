# 06 — API and UI

## 1. API (FastAPI)

Base path `/api`. Every case-level endpoint takes the `X-Tenant-Id` header (the demo tenant selector), except reviewer and ops endpoints, which use `X-Role: reviewer|ops` for the demo.

### Claims
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/claims` | Submit a denied claim (structured fields, notice text, evidence list). Creates it as RECEIVED. |
| `POST` | `/claims/from-scenario/{scenario_id}` | Inject a named evaluation or trap claim (demo button) |
| `GET` | `/claims?status=` | Inbox list (tenant-scoped; reviewers see all) |
| `GET` | `/claims/{id}` | Claim, current status, lease owner, attempt |
| `GET` | `/claims/{id}/timeline` | `CaseEvent` chain with agent, step, and payload |
| `GET` | `/claims/{id}/explanation` | Q10 subgraph as `{nodes, edges, highlights}` |
| `GET` | `/claims/{id}/recommendation` | Recommendation, items, citations, confidence, uncertainty |
| `POST` | `/claims/{id}/approve` | Reviewer approves (Supervisor gate) |
| `POST` | `/claims/{id}/outcome` | Reviewer records the real outcome, which triggers the Curator |

### Memory
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/memory/findings?status=` | Findings with support, wins, confidence, valid versions, and stale/contradiction links |
| `GET` | `/memory/findings/{id}` | Detail, including derived resolutions (tenant-safe, Q11) |
| `GET` | `/memory/playbooks` | Playbooks with steps and win rate |
| `GET` | `/memory/learned-since?ts=` | Q12 |
| `POST` | `/policy/publish/{version_id}` | Load a new policy version and run Curator mode B (Q6) |

### Ops
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/ops/workers` | Q13 heartbeat view |
| `POST` | `/ops/workers/{agent_id}/kill` | Supervisor sends `SIGKILL` / `docker kill` |
| `POST` | `/ops/workers/{role}/start` | Start a replica |
| `POST` | `/ops/reset` | Reseed the demo graph |

### Evaluation
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/eval/latest` | Latest results JSON produced by `make eval` |

### Live events
`GET /api/stream` is a Server-Sent Events stream. The API polls the graph every 500 ms for new `CaseEvent`s and heartbeat changes, then pushes them. The UI never polls separately. Using polling here (instead of having workers push) keeps the "graph is the only shared state" rule intact.

## 2. UI screens

Stack: React, Vite, TypeScript, Tailwind, shadcn/ui, and `react-force-graph-2d`. There's a fixed top banner: **"Synthetic demo data. Recommendations require human approval."**

### 2.1 Inbox (home)
- Columns or swimlanes by status: RECEIVED → CLASSIFIED → RETRIEVED → VERIFIED → AWAITING_REVIEW → CURATED, plus NEEDS_HUMAN.
- Each card shows the claim ID, service, denial reason, current lease owner (an agent avatar), and the attempt count.
- Cards animate between lanes live from SSE. This is the "agents coordinating through the graph" shot.
- Buttons: **Inject scenario ▾** (T1–T7, normal), **Reset demo**.

### 2.2 Case detail
Three panes:
1. **Left: timeline.** CaseEvents with agent badges. `LEASE_EXPIRED`, `RESUMED (attempt 2)`, and `FENCED_WRITE_REJECTED` are highlighted.
2. **Center: evidence graph.** Q10 rendered as a graph:
   - green for accepted path (claim → version → clause → Finding → Resolution);
   - red for rejected precedent, with the reason code on the edge (`VERSION_DRIFT → C-2026-MRI-PREAUTH`);
   - grey for context.
   Clicking a node shows its properties and clause text.
3. **Right: recommendation.**
   - Disposition badge, confidence, and an uncertainty list.
   - Checklist items. Each has a citation chip that highlights its node in the graph.
   - A "Rejected precedents" section with plain-language reasons.
   - **Approve** and **Record outcome** (reviewer role).

### 2.3 Memory
- Findings table: status pill (ACTIVE, STALE, CONTRADICTED), support/wins, confidence bar, `VALID_IN` version chips.
- A "Learned since restart" panel (Q12).
- **Publish 2026 policy** button. Watch Findings turn STALE live (Q6).
- Playbooks with step lists and win rates.

### 2.4 Ops
- Worker grid by role: alive/dead, current claim, last heartbeat.
- **Kill** button per worker, and a **Chaos mode** toggle (random kill every N seconds, stretch).
- Lease table: claim, owner, expires in, attempt.

### 2.5 Evaluation
- Results table: ClaimBridge vs. baseline per metric (from [07](07-evaluation.md)).
- Per-trap breakdown with pass/fail, plus a link to each case.
- A failures list, shown openly.

## 3. Demo-mode helpers
- `STEP_DELAY_S=2` so state changes are watchable.
- `LLM_MODE=cached` for a deterministic recording. A "Run live" toggle shows real calls.
- A pinned order of scenario buttons that matches the video script in [08](08-demo-and-submission.md).
