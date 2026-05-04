---
phase: 09-image-task-planner-dag-executor
plan: 04
subsystem: image_task_validation
tags: [typescript, vitest, image-task, plan-validator, dag-contracts, input-root]
requires:
  - phase: 09-image-task-planner-dag-executor
    provides: 09-01 planner contract, validator, budget validation, and input-root helper
  - phase: 09-image-task-planner-dag-executor
    provides: 09-03 image_task MCP dry-run and validation boundary
provides:
  - PLAN_MISSING_DEP validation for node output references without dependency edges
  - PLAN_OUTPUT_KIND_MISMATCH validation for planner-declared outputKind values that contradict capability op kind
  - INPUT_PATH_OUTSIDE_ROOT validation for caller-provided ctx.inputImages before dry_run can return success
  - Unit and e2e regressions closing CR-01, CR-02, and CR-03 from 09-REVIEW / 09-VERIFICATION
affects: [09-image-task-planner-dag-executor, 10-template-fast-paths-executor-parallelism, image_task, validatePlan]
tech-stack:
  added: []
  patterns: [validator-owned execution contract checks, dry-run boundary path-policy enforcement]
key-files:
  created:
    - .planning/phases/09-image-task-planner-dag-executor/09-04-SUMMARY.md
  modified:
    - src/task/plan-validator.ts
    - tests/task/plan-validator.test.ts
    - tests/integration/image_task.e2e.test.ts
key-decisions:
  - "Code, not the planner, owns DAG execution contract validation for refs, output kind compatibility, and input-root policy."
  - "ctx.inputImages are validated directly so dry_run cannot approve unsafe caller-provided paths referenced through $inputs.*."
patterns-established:
  - "EXPECTED_OUTPUT_KIND maps every CapabilityOp to the outputKind validatePlan requires before terminal image checks trust planner-declared kinds."
  - "Every $nodes.X.output string ref must be backed by X in the current node's dependsOn array, including nested params paths."
requirements-completed: [TASK-03, TASK-04]
duration: 4min
completed: 2026-05-03
---

# Phase 09 Plan 04: Validator Gap Closure Summary

**validatePlan now rejects missing DAG dependency edges, outputKind spoofing, and unsafe dry-run input paths before image_task can return a validated plan**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-03T17:46:30Z
- **Completed:** 2026-05-03T17:48:44Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments

- Added `PLAN_MISSING_DEP` validation for `$nodes.X.output` refs when the current node does not declare `X` in `dependsOn`.
- Added `EXPECTED_OUTPUT_KIND` and `PLAN_OUTPUT_KIND_MISMATCH` so data ops such as `analyze_dimensions`, `analyze_palette`, and `analyze_ocr` cannot be spoofed as image-producing nodes.
- Added direct `ctx.inputImages` validation through `assertWithinInputRoot`, closing the dry-run `$inputs.*` path-policy bypass.
- Added unit regressions for CR-01, CR-02, and CR-03 plus an `handleImageTask(... dry_run: true ...)` e2e regression proving unsafe input images fail before provider invocation.

## Task Commits

1. **Task 1: Add validator unit tests for reproduced gaps** - `2d4db03` (test)
2. **Task 2: Tighten validatePlan contract checks** - `07e3800` (fix)
3. **Task 3: Add dry-run integration regression** - `2d4db03` / `07e3800` (test/fix)
4. **Task 4: Run focused and phase-level verification** - completed in working session, no code commit required

## Files Created/Modified

- `src/task/plan-validator.ts` - Added output-kind map, missing-dependency validation, and direct `ctx.inputImages` root validation.
- `tests/task/plan-validator.test.ts` - Added focused regressions for `PLAN_MISSING_DEP`, `PLAN_OUTPUT_KIND_MISMATCH`, and `$inputs.*` `INPUT_PATH_OUTSIDE_ROOT`.
- `tests/integration/image_task.e2e.test.ts` - Added dry-run MCP boundary regression proving unsafe `input_images` return validation failure and do not invoke capabilities.
- `.planning/phases/09-image-task-planner-dag-executor/09-04-SUMMARY.md` - Execution summary and verification evidence.

## Decisions Made

- Kept validation errors accumulated rather than returning early, preserving the validator's existing multi-error semantics.
- Preserved early returns for unknown dependencies and cycles, because graph checks remain meaningless in those states.
- Kept literal image-input validation as defense in depth while adding direct caller-input validation for `$inputs.*`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The e2e test initially used an invalid hand-written `runId`, which exercised run directory validation before reaching plan validation. It now uses a valid run ID shape so the test reaches the intended dry-run validation boundary.
- The first RED unit assertion looked for `"depends on"` while the specified validator message says `"does not depend on"`. The assertion now matches the exact intended message semantics.

## User Setup Required

None - no external service configuration required.

## Verification

- `npx vitest run tests/task/plan-validator.test.ts` passed: 1 file, 16 tests.
- `npx vitest run tests/integration/image_task.e2e.test.ts` passed: 1 file, 6 tests.
- `npm run build` passed.
- `npm test -- --run tests/task/plan-validator.test.ts tests/integration/image_task.e2e.test.ts` passed: 2 files, 22 tests.
- `grep -n 'PLAN_MISSING_DEP' src/task/plan-validator.ts` returned line 253.
- `grep -n 'PLAN_OUTPUT_KIND_MISMATCH' src/task/plan-validator.ts` returned line 266.
- `grep -n 'EXPECTED_OUTPUT_KIND' src/task/plan-validator.ts` returned lines 45 and 263.
- `grep -n 'field: `\\$inputs\\.\\${inputName}`' src/task/plan-validator.ts` returned line 298.

## Previous Gap Readiness

The previous `09-VERIFICATION.md` TASK-03 and TASK-04 gaps are ready for re-verification:

- Missing `$nodes.extract.output` dependency now fails closed with `PLAN_MISSING_DEP`.
- `analyze_dimensions` with `outputKind: 'image'` now fails closed with `PLAN_OUTPUT_KIND_MISMATCH`.
- `IMAGE_GEN_INPUT_ROOT` plus outside-root `ctx.inputImages.product` now fails closed with `INPUT_PATH_OUTSIDE_ROOT`, including through `image_task` dry-run.

## Next Phase Readiness

Phase 10 can build template fast paths and executor parallelism on a stricter Phase 9 validation boundary. Invalid refs, data/image spoofing, and unsafe dry-run input paths are rejected before DAG execution or provider invocation.

## Self-Check: PASSED

- Verified key modified files exist: `src/task/plan-validator.ts`, `tests/task/plan-validator.test.ts`, `tests/integration/image_task.e2e.test.ts`, and this summary.
- Verified task commits exist in git history: `2d4db03`, `07e3800`.

---
*Phase: 09-image-task-planner-dag-executor*
*Completed: 2026-05-03*
