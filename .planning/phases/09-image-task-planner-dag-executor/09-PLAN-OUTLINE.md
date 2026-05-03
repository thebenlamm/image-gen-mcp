---
phase: 09-image-task-planner-dag-executor
mode: outline
plans: 3
waves: 3
generated: 2026-05-02
---

# Phase 9 Plan Outline

| Plan ID | Objective | Wave | Depends On | Requirements |
|---------|-----------|------|------------|--------------|
| 09-01 | [BLOCKING] Install `@anthropic-ai/sdk@^0.92.0`. Build planner foundation: Zod plan schema (D-01..D-05) as the durable execution contract; `src/task/planner.ts` Anthropic Haiku client with capability snapshot from `list_capabilities`, structured-output prompt, `PlannerError` taxonomy (D-07, D-08); `src/task/plan-validator.ts` running 12 ordered passes (schema → node-id uniqueness → ref syntax → cycle/topology → ref typing image-vs-data → ref-source existence → capability `(op,provider)` registered → per-node `validateCapabilityParams` reuse → input path policy → output_size/format compatibility → budget cap → latency cap) per D-04/D-06/D-09; `src/utils/path-input-root.ts` enforcing `IMAGE_GEN_INPUT_ROOT` via `fs.realpath` + `path.sep` boundary (D-26, D-27); unit tests for schema, validator (each pass), planner (mocked Anthropic client), and path-input-root. Dep install task is the gate inside this plan — all subsequent code depends on it. | 1 | [] | TASK-01, TASK-02, TASK-03, TASK-05, TASK-10 |
| 09-02 | DAG executor + run/trace integration. Build `src/task/dag-executor.ts` (Kahn topological walk, retry-once on `CapabilityInvokeError.retryable=true` per D-13, transitive skip of unsatisfiable downstream nodes per D-14, sequential execution preserving Phase 10 parallelism shape per D-12); `src/task/ref-resolver.ts` (recursive object walk substituting `$inputs.X` and `$nodes.X.output` per D-03); `src/task/best-partial.ts` (BFS-from-terminal selecting latest successful image-producing node per D-15, with `_partial.png` filename suffix); extend `src/runs/trace.ts` with `outcome:'skipped'`, `inputRefs`, `errorDetail` (lifted from `CapabilityInvokeError` per D-16), `attempts`, plus top-level `skips[]`; extend `src/runs/manifest.ts` `invocation` to carry `goal`/`inputImages`/`constraints` and add top-level `plan`/`planner`/`totals`/`bestPartial` (D-21); per-node atomic artifact writes via `nodeArtifactPath` + `writeFileAtomic`; integration tests covering successful happy-path DAG, forced-failure with best-partial recovery, dry_run no-invoke (D-04), and skipped-downstream after retryable failure exhaustion. | 2 | [09-01] | TASK-04, TASK-06, TASK-07, TASK-08, TASK-10 |
| 09-03 | MCP tool registration + response contract + e2e. Register `image_task` tool in `src/index.ts` mirroring `image_op`'s tool registration / run-init preamble / manifest write / error envelope patterns; implement `handleImageTask` orchestrator (planner call → plan-validator → dry_run early-return → DAG executor → terminal save via `resolveOutputPath`+`saveImage` → response build); `src/task/serialize-response.ts` recursive Buffer/base64 guard enforcing path-only response per D-20 (TASK-09); compact MCP response shape `{ output, runId, total_cost_usd, total_latency_ms, plan summary, trace }` per D-17/D-18/D-19; e2e smoke test asserting ROADMAP success criterion #1 (extract→composite→transform DAG from `{goal, input_images}`) plus dry_run / budget-cap-fail / mid-DAG-failure trace identification; README updates documenting `ANTHROPIC_API_KEY` (required) and `IMAGE_GEN_INPUT_ROOT` (optional) env vars. | 3 | [09-02] | TASK-01, TASK-08, TASK-09, TASK-10 |

## Coverage Audit

Every TASK-01..TASK-10 ID is covered by at least one plan:

| Req ID | Covered By | Notes |
|--------|-----------|-------|
| TASK-01 | 09-01, 09-03 | Plan schema + tool input shape (09-01); MCP tool registration (09-03) |
| TASK-02 | 09-01 | `constraints` schema fields validated by plan-validator |
| TASK-03 | 09-01 | Haiku planner emits Zod-validated JSON plan |
| TASK-04 | 09-02 | dry_run path returns plan without executor invocation |
| TASK-05 | 09-01 | `budget_cap_usd` plan-time gate (validator pass 11) |
| TASK-06 | 09-02 | DAG executor topological walk |
| TASK-07 | 09-02 | Per-node try/catch + best-partial via BFS |
| TASK-08 | 09-02, 09-03 | Per-node trace + totals (09-02); response envelope (09-03) |
| TASK-09 | 09-03 | Path-only serializer + Buffer guard |
| TASK-10 | 09-01, 09-02, 09-03 | `revisedPrompt` field in plan schema (09-01), trace builder propagation (09-02), response surface (09-03) |

## Wave Structure

- **Wave 1** — `09-01` (sole plan; dep install [BLOCKING] gate is the first task inside it)
- **Wave 2** — `09-02` (depends on 09-01: imports plan schema, validator, path-input-root)
- **Wave 3** — `09-03` (depends on 09-02: imports dag-executor and extended trace/manifest types)

Sequential wave structure is intentional: each plan layers a strict consumer of the previous plan's exports (schema → executor → tool). No file-ownership overlap exists, so a Wave 2/3 reorder would not yield parallelism — the dependency is on TypeScript exports, not just files.

## NOTES

**Dep install placement (justification for keeping inside 09-01 vs splitting):**
The orchestrator's hard rules permit either (a) dep install as its own Wave 1 plan running parallel with 09-01, or (b) dep install as a [BLOCKING] task gating 09-01. We chose (b) because:
1. 09-01 is the only Wave 1 plan — there is nothing to parallelize against, so a separate dep-install plan adds wave overhead with no parallelism gain.
2. `src/task/planner.ts` (inside 09-01) is the sole consumer of `@anthropic-ai/sdk`; splitting the install away from its consumer is artificial separation.
3. Keeping the install gated as Task 1 of 09-01 preserves the [BLOCKING] semantic — no other 09-01 task can start until the dep is on disk and types resolve.
4. The dep install task is explicitly marked [BLOCKING] in 09-01's task list and verified by `grep '@anthropic-ai/sdk' package.json`.

**Why three plans (not two, not four):**
- Two plans would fuse the executor (~30% context) with either planner (~25%) or tool registration + e2e (~25%), pushing a single plan over the 50% context target.
- Four plans would split executor from ref-resolver/best-partial, but those three modules form one cohesive subsystem (executor calls both utilities directly with no other consumer in Phase 9). Splitting them adds a wave with no semantic boundary.
- Three plans cleanly map to the three distinct subsystems: **contract layer** (schema/validator/planner/path-security), **execution layer** (DAG/refs/best-partial/trace+manifest extensions), **integration layer** (MCP tool/response/e2e/docs).

**File ownership (no overlaps within a wave; sequential dependencies on extensions):**
- 09-01 creates: `src/task/plan-schema.ts`, `src/task/planner.ts`, `src/task/plan-validator.ts`, `src/utils/path-input-root.ts`, plus per-capability one-line `assertWithinInputRoot` additions in all 8 `src/capabilities/*.ts` files (per PATTERNS §"Top-of-invoke defensive check").
- 09-02 creates: `src/task/dag-executor.ts`, `src/task/ref-resolver.ts`, `src/task/best-partial.ts`. Extends: `src/runs/trace.ts`, `src/runs/manifest.ts` (additive only — both files explicitly support extension per PATTERNS).
- 09-03 modifies: `src/index.ts` (additive: new tool registration + `handleImageTask`), creates `src/task/serialize-response.ts`, updates `README.md`. Sequential dependency on 09-02 (imports executor types) is the only ordering constraint.

**Deferred backlog folded in:** ROADMAP.md's deferred `IMAGE_GEN_INPUT_ROOT` backlog item is fully addressed by 09-01 (`path-input-root.ts` utility + per-capability adoption) per D-26/D-27. No item is left unplanned.

**Best-partial mechanical definition:** Per D-15, `src/task/best-partial.ts` (09-02) implements BFS-from-terminal selecting the latest successful image-producing node nearest the intended terminal output. Data-only nodes are excluded from best-partial selection but their data remains in trace.

**No phase split needed:** All 10 TASK requirements fit comfortably in three plans with the recommended split. No source-audit gaps. No items deferred to other phases. All four artifact sources (GOAL/REQ/RESEARCH/CONTEXT) covered.

## OUTLINE COMPLETE

Plan count: 3
