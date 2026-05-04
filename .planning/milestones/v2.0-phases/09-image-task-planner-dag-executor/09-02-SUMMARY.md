---
phase: 09-image-task-planner-dag-executor
plan: 02
subsystem: image_task_executor
tags: [typescript, vitest, dag-executor, trace, manifest, capability-registry]
requires:
  - phase: 09-image-task-planner-dag-executor
    provides: PlanSchema, validatePlan, and planner contracts from 09-01
provides:
  - Reference resolver for `$inputs.X` and `$nodes.X.output`
  - Deterministic best-partial selector for terminal dependency chains
  - Sequential Kahn-order DAG executor with retry-once and transitive skip semantics
  - Additive TraceNode and RunManifest fields for image_task audit trails
  - Unit and integration tests for success, failure, dry-run, artifacts, and manifest round trip
affects: [09-image-task-planner-dag-executor, 10-template-fast-paths-executor-parallelism, image_task]
tech-stack:
  added: []
  patterns: [Kahn topological ready queue, retry-once CapabilityInvokeError handling, BFS best-partial selection, additive run schema extension]
key-files:
  created:
    - src/task/ref-resolver.ts
    - src/task/best-partial.ts
    - src/task/dag-executor.ts
    - tests/task/ref-resolver.test.ts
    - tests/task/best-partial.test.ts
    - tests/task/dag-executor.test.ts
    - tests/integration/image_task.dag.test.ts
    - tests/integration/image_task.failure.test.ts
    - tests/integration/image_task.dry-run.test.ts
  modified:
    - src/runs/trace.ts
    - src/runs/manifest.ts
key-decisions:
  - "DAG execution is sequential Kahn-order in 09-02, with ready-queue shape preserved for Phase 10 bounded parallelism."
  - "Best partial selection is image-only and walks backward from terminalNodeId over dependsOn, preserving declared dependency order for deterministic ties."
  - "RunManifest image_task support remains additive and optional so existing image_op manifests keep compiling unchanged."
patterns-established:
  - "Executor emits one TraceNode per plan node, including skipped downstream nodes."
  - "CapabilityInvokeError fields flow into TraceNode.errorDetail; arbitrary errors remain unstructured and non-retryable."
requirements-completed: [TASK-04, TASK-06, TASK-07, TASK-08, TASK-10]
duration: 10min
completed: 2026-05-03
---

# Phase 09 Plan 02: DAG Executor Summary

**Small image_task DAG executor with explicit ref resolution, retry-once failures, transitive skips, best partial artifacts, and path-only trace/manifest contracts**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-03T16:01:38Z
- **Completed:** 2026-05-03T16:11:09Z
- **Tasks:** 11
- **Files modified:** 11

## Accomplishments

- Added `resolveRefs(value, ctx)` for recursive `$inputs.*` and `$nodes.*.output` substitution across nested params.
- Added `selectBestPartial(plan, outcomes)` using deterministic BFS from `terminalNodeId`; data outputs never qualify.
- Added `executeDag(plan, inputs, ctx)` with Kahn topological order, retry-once for retryable `CapabilityInvokeError`, structured error trace details, transitive skips, per-node artifacts, totals, and best partial output.
- Extended `TraceNode` with `skipped`, `inputRefs`, `errorDetail`, `attempts`, and `skipReason`; extended `RunManifest` for image_task invocation, plan, planner, totals, and bestPartial.
- Added unit and integration coverage proving happy-path artifacts, mid-DAG failure best partial, dry-run zero-invoke behavior, and no base64 response leakage.

## Final Contracts for 09-03

- `NodeOutput`: `{ kind: 'image'; artifactPath: string } | { kind: 'data'; data: unknown }`.
- `NodeOutcome`: `{ status: 'success' | 'error' | 'skipped'; output?: NodeOutput }`.
- `ExecPlan`: `{ goal, inputImages?, constraints?, nodes, terminalNodeId }`, where nodes carry `id`, `op`, `provider`, `params`, `dependsOn`, `outputKind`, optional `costUsd`, `latencyMs`, and `reason`.
- `ExecCtx`: `{ runId, runDir, registry? }`; registry defaults to `capabilityRegistry`.
- `ExecResult`: `{ nodeOutputs, trace, totals, bestPartial }`.
- `TraceNode.outcome`: `'success' | 'error' | 'skipped'`, with optional `inputRefs`, `errorDetail`, `attempts`, and `skipReason`.
- `RunManifest.invocation`: `tool` plus optional image_op fields (`op`, `provider`, `params`, `outputPath`, `outputDir`) and optional image_task fields (`goal`, `inputImages`, `constraints`).
- `RunManifest` top-level image_task fields: `plan`, `planner`, `totals`, and `bestPartial`.

## Task Commits

1. **Task 1/6: Ref resolver tests and implementation** - `f7e2cce` (test), `a283eac` (feat)
2. **Task 2/7: Best partial tests and implementation** - `7066ab9` (test), `05b757f` (feat)
3. **Task 3: Extend trace** - `208e88a` (feat)
4. **Task 4: Extend manifest** - `81c5540` (feat)
5. **Task 5/8: DAG executor tests and implementation** - `079a884` (test), `b408350` (feat)
6. **Task 9: Happy-path DAG integration** - `327e2de` (test)
7. **Task 10: Failure integration** - `72f73b3` (test)
8. **Task 11: Dry-run integration** - `aeb38c1` (test)

## Files Created/Modified

- `src/task/ref-resolver.ts` - Recursive resolver for input and node-output refs.
- `src/task/best-partial.ts` - Deterministic terminal-chain best partial selector.
- `src/task/dag-executor.ts` - Kahn-order executor with retry, skip, trace, artifacts, totals, and bestPartial.
- `src/runs/trace.ts` - Additive trace outcome and debug fields.
- `src/runs/manifest.ts` - Additive image_task invocation and audit fields.
- `tests/task/*.test.ts` - Focused unit tests for resolver, selector, and executor semantics.
- `tests/integration/image_task.*.test.ts` - End-to-end executor tests for success, failure, dry-run, artifacts, manifest, and no-base64 checks.

## Decisions Made

- Kept `best-partial.ts` structurally typed so it does not depend on the full 09-01 `Plan` type.
- Rounded `totals.cost_usd` to six decimals after aggregation to avoid floating-point drift in response/manifest contracts.
- Filtered binary metadata values in executor trace nodes as defense-in-depth for D-20, while preserving ordinary telemetry metadata.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stabilized total cost precision**
- **Found during:** Task 9 (happy-path DAG integration)
- **Issue:** JavaScript floating-point addition produced `0.034999999999999996` instead of the expected `0.035`.
- **Fix:** Round executor `totals.cost_usd` to six decimals after aggregation.
- **Files modified:** `src/task/dag-executor.ts`
- **Verification:** `npx vitest run tests/integration/image_task.dag.test.ts` and `npx vitest run tests/task/dag-executor.test.ts`
- **Committed in:** `327e2de`

**2. [Rule 2 - Missing Critical] Dropped binary metadata from trace nodes**
- **Found during:** Task 5 (DAG executor implementation)
- **Issue:** D-20 forbids Buffer/base64 leakage; capability metadata is intended as telemetry, but the executor needed defense-in-depth against binary metadata.
- **Fix:** Added metadata filtering for Buffer, ArrayBuffer, and typed-array values before passing metadata to `buildTraceNode`.
- **Files modified:** `src/task/dag-executor.ts`
- **Verification:** `npx vitest run tests/task/dag-executor.test.ts` and Task 9 JSON stringify no-base64 guard.
- **Committed in:** `b408350`

**Total deviations:** 2 auto-fixed issues.
**Impact on plan:** Both fixes tighten correctness and output stability without expanding architecture.

## Known Stubs

None.

## Threat Flags

None. This plan adds executor-to-filesystem writes under existing run directories and widens trace/manifest audit shapes, both covered by the plan threat model.

## Issues Encountered

- The local SDK package was not installed under `node_modules`, so state loading used `gsd-sdk` on `PATH`.
- TDD tasks in the plan separated test files into later task numbers; RED/GREEN commits were still made before implementation, and the task mapping above records the paired commits.

## Verification

- `npm run build` passed.
- `npx vitest run tests/task/ tests/integration/` passed: 13 files, 71 tests.
- `npx vitest run tests/runs/` passed: 4 files, 24 tests.
- `grep -n "'skipped'" src/runs/trace.ts` returned 2 matches.
- `grep -n "function executeDag(" src/task/dag-executor.ts` returned 1 match.
- `grep -n "function resolveRefs(" src/task/ref-resolver.ts` returned 1 match.
- `grep -n "selectBestPartial" src/task/best-partial.ts` returned 1 match.

## Next Phase Readiness

09-03 can wire the MCP `image_task` handler by validating/planning, resolving `runDir`, calling `executeDag`, writing an image_task manifest with `plan`, `totals`, and `bestPartial`, and then shaping a compact path-only MCP response from `ExecResult`.

## Self-Check: PASSED

- Verified all created/modified implementation, test, and summary files exist.
- Verified task commits exist in git history: `f7e2cce`, `a283eac`, `7066ab9`, `05b757f`, `208e88a`, `81c5540`, `079a884`, `b408350`, `327e2de`, `72f73b3`, `aeb38c1`.

---
*Phase: 09-image-task-planner-dag-executor*
*Completed: 2026-05-03*
