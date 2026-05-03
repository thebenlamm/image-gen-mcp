---
phase: 09-image-task-planner-dag-executor
plan: 03
subsystem: image_task_mcp_surface
tags: [typescript, vitest, mcp, image-task, response-guard, dag-executor]
requires:
  - phase: 09-image-task-planner-dag-executor
    provides: 09-01 planner contract, validator, and IMAGE_GEN_INPUT_ROOT path policy
  - phase: 09-image-task-planner-dag-executor
    provides: 09-02 DAG executor, trace nodes, best partial, and manifest extensions
provides:
  - Registered image_task MCP tool with goal, input_images, constraints, dry_run, runId, seed, outputDir, and outputPath inputs
  - handleImageTask orchestration from planner to validator to dry-run or DAG execution, terminal save, manifest, and compact serializer
  - Path-only response serializer with Buffer, typed-array, data-URL, and long-base64 defensive guards
  - Unit and e2e tests proving ROADMAP Phase 9 success criteria 1-5
  - README documentation for ANTHROPIC_API_KEY, IMAGE_GEN_INPUT_ROOT, dry_run, budget caps, trace shape, and best partial failures
affects: [09-image-task-planner-dag-executor, 10-template-fast-paths-executor-parallelism, image_task, README]
tech-stack:
  added: []
  patterns: [response-boundary binary guard, mocked planner e2e tests, compact plan projection, best-effort rich manifest]
key-files:
  created:
    - src/task/index.ts
    - src/task/serialize-response.ts
    - tests/task/serialize-response.test.ts
    - tests/integration/__helpers__/image-task-mocks.ts
    - tests/integration/image_task.e2e.test.ts
    - tests/fixtures/product.jpg
  modified:
    - src/index.ts
    - src/runs/manifest.ts
    - README.md
key-decisions:
  - "image_task dry_run returns the compact validated plan and estimated totals without using the normal terminal-output success predicate."
  - "Budget-cap validation response rounds estimated_cost_usd to six decimals to match executor total precision and avoid JavaScript floating-point leakage."
  - "The serializer adapts the actual 09-02 ExecResult contract rather than the stale DagExecutionResult sketch in the plan."
patterns-established:
  - "ResponseGuardError carries code plus jsonPath and is run as a final sweep over the entire MCP response."
  - "E2E tests mock the planner at module-import time but use the real handleImageTask, validator, executor, output saving, and serializer."
requirements-completed: [TASK-01, TASK-08, TASK-09, TASK-10]
duration: 9min
completed: 2026-05-03
---

# Phase 09 Plan 03: image_task MCP Surface Summary

**Registered image_task goal handoff with planner validation, DAG execution, path-only response serialization, and documented provisioning**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-03T16:15:26Z
- **Completed:** 2026-05-03T16:24:38Z
- **Tasks:** 5
- **Files modified:** 9

## Accomplishments

- Added `image_task` to the MCP server with the full input shape: `goal`, `input_images`, `constraints`, `dry_run`, `runId`, `seed`, `outputDir`, and `outputPath`.
- Added `handleImageTask`, which runs plan -> validate -> dry-run gate -> execute DAG -> save terminal image -> write manifest -> serialize compact response.
- Added `serializeImageTaskResponse` and `ResponseGuardError`, enforcing D-20 by rejecting Buffers, typed arrays, image data URLs, and long base64-looking strings anywhere in the response.
- Added focused serializer coverage and an e2e suite mapping directly to Phase 9 ROADMAP success criteria #1-#5.
- Documented `ANTHROPIC_API_KEY`, `IMAGE_GEN_INPUT_ROOT`, `image_task` usage, dry-run behavior, budget caps, path-only trace shape, and best-partial failure semantics.

## Task Commits

1. **Task 2: Write serializer tests (RED)** - `9eb6603` (test)
2. **Task 1: Create response serializer (GREEN)** - `d2682ee` (feat)
3. **Task 3: Register image_task MCP tool** - `450310f` (feat)
4. **Task 4: Write image_task e2e tests** - `501ca74` (test)
5. **Task 5: Document image_task** - `c195743` (docs)

## Files Created/Modified

- `src/task/serialize-response.ts` - Compact response builder and recursive binary/base64 guard.
- `src/task/index.ts` - Barrel export for planner, validator, executor, resolver, and serializer modules.
- `src/index.ts` - `image_task` tool registration and `handleImageTask` orchestration.
- `src/runs/manifest.ts` - Allows skipped node outcomes in image_task manifests.
- `tests/task/serialize-response.test.ts` - 10 unit tests for happy path, guard failures, compact plan projection, totals, revisedPrompt, and error envelopes.
- `tests/integration/image_task.e2e.test.ts` - Five mocked end-to-end tests for Phase 9 ROADMAP success criteria.
- `tests/integration/__helpers__/image-task-mocks.ts` - Planner and capability mock helpers for image_task e2e coverage.
- `tests/fixtures/product.jpg` - Tiny fixture path used by mocked e2e tests.
- `README.md` - Environment, usage, and tool-reference documentation for image_task.

## Decisions Made

- Used the actual 09-01/09-02 contracts (`PlannerOutput`, `PlanValidationSuccess/Failure`, and `ExecResult`) instead of the plan's older interface sketch.
- Kept the user-facing response compact: plan steps are exactly `{id, op, provider, dependsOn}` and richer params/reasons remain in the on-disk manifest.
- Treated manifest write failures after execution as non-fatal, matching the plan and existing image_op best-effort audit behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rounded budget-cap estimated cost in error responses**
- **Found during:** Task 4 (image_task e2e budget-cap test)
- **Issue:** Validator recomputation exposed JavaScript floating-point drift as `0.034999999999999996` instead of `0.035` in `estimated_cost_usd`.
- **Fix:** Rounded `estimated_cost_usd` to six decimals at the response boundary, matching executor total precision.
- **Files modified:** `src/index.ts`
- **Verification:** `npx vitest run tests/integration/image_task.e2e.test.ts`
- **Committed in:** `501ca74`

**Total deviations:** 1 auto-fixed bug.
**Impact on plan:** Tightened the public response contract; no architecture or scope expansion.

## Issues Encountered

- The plan listed Task 1 implementation before Task 2 tests, but both were TDD-marked. I committed the RED serializer tests first, then the serializer implementation, and recorded the task mapping above.
- The plan's interface block used stale names (`estimatedCostUsd`, `DagExecutionResult`, throwing `validatePlan`). The implementation adapted to the real shipped contracts from 09-01/09-02.
- E2E tests needed `CapabilityInvokeError` from the same dynamically imported module instance as the executor; otherwise `instanceof` would not preserve structured error fields after `vi.resetModules()`.

## Known Stubs

None.

## Threat Flags

None. This plan adds the planned MCP response boundary and tool surface from the threat model; mitigations are implemented by the serializer guard, compact plan projection, validator budget gate, and existing IMAGE_GEN_INPUT_ROOT validation.

## Verification

- `npm run build` passed.
- `npx vitest run tests/task/serialize-response.test.ts` passed: 1 file, 10 tests.
- `npx vitest run tests/integration/image_task.e2e.test.ts` passed: 1 file, 5 tests.
- `npm test` passed: 38 files, 202 tests.
- `grep -c "function handleImageTask" src/index.ts` returned `1`.
- `grep -c "'image_task'" src/index.ts` returned `3`.
- `grep -c "ANTHROPIC_API_KEY" README.md` returned `3`.
- `grep -c "IMAGE_GEN_INPUT_ROOT" README.md` returned `2`.
- `grep -c "image_task" README.md` returned `7`.

## Next Phase Readiness

Phase 10 can add template fast-paths and bounded executor parallelism without changing the `image_task` response shape. `handleImageTask` already preserves the plan/validate/execute/serialize boundary and the executor remains the only place that needs widening for parallel scheduling.

## Self-Check: PASSED

- Verified created files exist: `src/task/serialize-response.ts`, `src/task/index.ts`, `tests/task/serialize-response.test.ts`, `tests/integration/image_task.e2e.test.ts`, `tests/integration/__helpers__/image-task-mocks.ts`, `tests/fixtures/product.jpg`, and this summary.
- Verified task commits exist in git history: `9eb6603`, `d2682ee`, `450310f`, `501ca74`, `c195743`.

---
*Phase: 09-image-task-planner-dag-executor*
*Completed: 2026-05-03*
