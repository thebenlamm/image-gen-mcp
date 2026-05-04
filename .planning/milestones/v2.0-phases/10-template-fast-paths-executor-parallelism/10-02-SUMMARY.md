---
phase: 10-template-fast-paths-executor-parallelism
plan: 02
subsystem: task-execution
tags: [image_task, templates, budget-gate, dag, parallelism, sharp, vitest]

requires:
  - phase: 10-template-fast-paths-executor-parallelism
    provides: template fast paths, plannerMethod response metadata, matchTemplate()
provides:
  - Sub-cent budget gate requiring template matches before planner invocation
  - Global sharp/libvips concurrency cap at 2
  - Bounded concurrent DAG ready-queue execution capped at 2 nodes
affects: [phase-10, image_task, dag-executor, planner-routing]

tech-stack:
  added: []
  patterns:
    - TDD RED/GREEN commits for sharp config, budget gate, and DAG parallelism
    - Shared concurrency constants align node-level parallelism with sharp/libvips concurrency

key-files:
  created:
    - src/task/sharp-config.ts
    - src/task/budget-gate.ts
    - tests/task/sharp-config.test.ts
    - tests/task/budget-gate.test.ts
    - tests/integration/image_task.budget.test.ts
    - tests/integration/image_task.parallelism.test.ts
  modified:
    - src/task/dag-executor.ts
    - src/task/index.ts
    - src/index.ts
    - tests/task/dag-executor.test.ts
    - tests/integration/image_task.e2e.test.ts

key-decisions:
  - "TEMPLATE_ONLY_BUDGET_USD_THRESHOLD is the single source for the $0.01 template-only budget cutoff."
  - "MAX_PARALLEL_NODES is exported from sharp-config and kept equal to SHARP_CONCURRENCY_LIMIT."
  - "DAG sibling failures do not cancel already in-flight siblings; only descendants are skipped."

patterns-established:
  - "Pre-planner policy gates run after template matching and before any planImageTask call."
  - "executeDag drains ready nodes in Promise.all batches capped by MAX_PARALLEL_NODES."

requirements-completed: [TMPL-04]

duration: 7min 50s
completed: 2026-05-03
---

# Phase 10 Plan 02: Budget Gate + Bounded Parallelism Summary

**Sub-cent image_task budgets now require template routing, while independent DAG nodes run concurrently under a shared sharp/libvips cap of 2.**

## Performance

- **Duration:** 7min 50s
- **Started:** 2026-05-03T19:08:30Z
- **Completed:** 2026-05-03T19:16:20Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added `src/task/sharp-config.ts` with `SHARP_CONCURRENCY_LIMIT = 2`, `MAX_PARALLEL_NODES = 2`, and a single module-load `sharp.concurrency(2)` call.
- Added `src/task/budget-gate.ts` and wired `handleImageTask` so sub-cent non-template goals return `BUDGET_CAP_REQUIRES_TEMPLATE` before planner auth or Anthropic SDK use.
- Refactored `executeDag` to drain ready nodes in `Promise.all` batches capped by `MAX_PARALLEL_NODES`, preserving dependency, validation, failure, skip, and best-partial behavior.
- Verified TMPL-04 in both directions:
  - Negative: `tests/integration/image_task.budget.test.ts` rejects `budget_cap_usd: 0.005` for `render a sunset` with `BUDGET_CAP_REQUIRES_TEMPLATE`, not `PLANNER_AUTH`.
  - Positive: the same file allows `profile_pic` with an input image and `budget_cap_usd: 0.005`, returning `plannerMethod: "template"`.

## Task Commits

1. **Task 1 RED:** `5a84edc` test(10-02): add failing sharp concurrency config tests
2. **Task 1 GREEN:** `7ebafa8` feat(10-02): configure sharp concurrency limit
3. **Task 2 RED:** `2a52e8d` test(10-02): add failing budget gate tests
4. **Task 2 GREEN:** `b22bbee` feat(10-02): gate sub-cent image task budgets
5. **Task 3 RED:** `afaecdc` test(10-02): add failing dag parallelism tests
6. **Task 3 GREEN:** `9614596` feat(10-02): execute dag ready nodes in bounded parallel batches
7. **Regression alignment:** `b08aba6` test(10-02): align budget cap regression with template gate

## Files Created/Modified

- `src/task/sharp-config.ts` - Shared sharp/libvips and DAG concurrency limits, with module-load sharp configuration.
- `src/task/budget-gate.ts` - Template-only budget threshold and pure `checkBudgetGate()` policy function.
- `src/task/dag-executor.ts` - Ready-queue batching with `Promise.all` capped by `MAX_PARALLEL_NODES`.
- `src/task/index.ts` - Re-exported budget gate module.
- `src/index.ts` - Invokes budget gate after `matchTemplate` and before `planImageTask`.
- `tests/task/sharp-config.test.ts` - Unit coverage for module-load sharp concurrency behavior and exports.
- `tests/task/budget-gate.test.ts` - Pure budget-gate threshold and boundary coverage.
- `tests/task/dag-executor.test.ts` - Parallel overlap, cap, topological, sibling-failure, and validation regression coverage.
- `tests/integration/image_task.budget.test.ts` - TMPL-04 boundary coverage through `handleImageTask`.
- `tests/integration/image_task.parallelism.test.ts` - Wall-clock integration proof for independent node overlap.
- `tests/integration/image_task.e2e.test.ts` - Existing budget-cap validation case adjusted above the template-only threshold.

## Decisions Made

- Kept the side-effect import `import './sharp-config.js'` in `dag-executor.ts` while also importing `MAX_PARALLEL_NODES` as a value, preserving the explicit module-load cap signal.
- Kept the budget gate as a pure function so tests can prove policy independently of MCP response shaping.
- Treated the older `BUDGET_CAP_EXCEEDED` test as a planner-validation test and moved its cap to `0.02`, above the template-only threshold and below the mocked `0.035` plan cost.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing budget-cap regression to avoid the new pre-planner gate**
- **Found during:** Plan-level verification after Task 3
- **Issue:** `tests/integration/image_task.e2e.test.ts` used `budget_cap_usd: 0.001` to test `BUDGET_CAP_EXCEEDED`, but TMPL-04 now correctly reserves sub-cent caps for template-only routing before planner validation.
- **Fix:** Changed that regression to `budget_cap_usd: 0.02`, which remains below the mocked plan cost (`0.035`) while staying above the template-only threshold.
- **Files modified:** `tests/integration/image_task.e2e.test.ts`
- **Verification:** `npx vitest run tests/task tests/integration` passed with 128 tests.
- **Committed in:** `b08aba6`

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Test expectation alignment only; product behavior follows the 10-02 requirements.

## Issues Encountered

None beyond the regression alignment documented above.

## User Setup Required

None - no external service configuration required.

## Verification

- `npm run build` - passed
- `npx vitest run tests/task tests/integration` - 21 files passed, 128 tests passed
- `node --input-type=module -e "import('./dist/task/sharp-config.js').then(async () => { const sharp = (await import('sharp')).default; console.log(sharp.concurrency()); })"` - output `2`
- `grep -rn "0.01" src/task/ | grep -v "0.001" | grep -v test | grep -v budget-gate.ts` - no output
- `grep -rn "sharp.concurrency" src/ | grep -v sharp-config.ts` - no output
- `tests/integration/image_task.parallelism.test.ts` wall-clock proof - passed in 212ms for two independent 200ms extract nodes plus terminal composition, below the sequential baseline

## Known Stubs

None.

## Threat Flags

None - budget gating and DAG/libvips concurrency controls are covered by the 10-02 threat model.

## Next Phase Readiness

Phase 10 requirements are complete. Phase 11 can add provider breadth against a planner path that now has template fast paths, sub-cent budget enforcement, and bounded executor parallelism.

## Self-Check: PASSED

- Found `src/task/sharp-config.ts`
- Found `src/task/budget-gate.ts`
- Found `tests/integration/image_task.parallelism.test.ts`
- Found this summary file
- Found task commits `5a84edc`, `7ebafa8`, `2a52e8d`, `b22bbee`, `afaecdc`, `9614596`, and `b08aba6` in git history

---
*Phase: 10-template-fast-paths-executor-parallelism*
*Completed: 2026-05-03*
