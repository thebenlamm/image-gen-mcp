---
phase: 07-eval-harness-golden-set
plan: 02
subsystem: testing
tags: [eval, registry, capability-quality, routing, guardrails]

requires:
  - phase: 07-eval-harness-golden-set
    provides: "Plan 07-01 eval fixtures, cases, scorers, runner, and JSON result writer"
provides:
  - "Eval result JSON aggregation into capability quality scores"
  - "Registry-level unscored second-provider production guardrail"
  - "Scored capability listing API for future planner routing"
  - "Phase 7 acceptance tests proving EVAL-01 through EVAL-05 preconditions"
affects: [capability-registry, eval, planner-routing, phase-09-image-task]

tech-stack:
  added: []
  patterns:
    - "CapabilityRegistry.register accepts explicit non-production unscored override options"
    - "Eval score keys are scorer ids aggregated by arithmetic mean over matching scored cases"
    - "Eval result provenance is stored on capability quality via evaluatedAt and evalResultPath"

key-files:
  created:
    - src/eval/apply-results.ts
    - tests/capabilities/registry-quality.test.ts
    - tests/eval/apply-results.test.ts
    - tests/eval/run-quality.test.ts
    - tests/eval/phase7.acceptance.test.ts
  modified:
    - src/capabilities/types.ts
    - src/capabilities/registry.ts
    - src/eval/index.ts
    - src/eval/run.ts
    - tests/eval/run.test.ts
    - tests/integration/image_op.runs.test.ts
    - tests/integration/image_op.trace.test.ts

key-decisions:
  - "Second providers for an existing op must carry non-empty quality.scores unless allowUnscoredProduction is explicitly passed."
  - "Eval score application ignores skipped, errored, non-finite, and model-version-mismatched results."
  - "runEval() remains a result-path-returning command while also applying scores in-process after JSON persistence."

patterns-established:
  - "Use listScored(op?) for planner-facing capability lists that must exclude unmeasured providers."
  - "Use result JSON as the source of truth, then apply that result back into registry quality metadata."

requirements-completed: [EVAL-04, EVAL-05]

duration: 11min
completed: 2026-05-02
---

# Phase 07 Plan 02: Eval Results Registry Quality Summary

**Eval results now populate capability quality scores and block unscored second-provider production routing**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-02T20:46:56Z
- **Completed:** 2026-05-02T20:58:01Z
- **Tasks:** 4
- **Files modified:** 12

## Accomplishments

- Added quality-aware registry registration options, unscored second-provider blocking, and `listScored(op?)`.
- Added eval result aggregation by scorer id with provenance (`evaluatedAt`, `evalResultPath`) and model-version filtering.
- Wired `runEval()` so written result JSON is applied back into in-process registry quality metadata.
- Added Phase 7 acceptance coverage for fixture/case coverage, unscored provider blocking, scored listing, and quality invalidation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add quality-aware registry APIs and unscored second-provider guardrail** - `803bf38` (feat)
2. **Task 2: Apply eval result scores to registered capabilities** - `5e4bde8` (feat)
3. **Task 3: Make npm run eval populate registry quality in-process and persist scored JSON** - `59d04ac` (feat)
4. **Task 4: Validate Phase 7 end-to-end routing preconditions** - `41378a6` (test)

**Plan metadata:** final docs commit records this summary and state updates.

## Files Created/Modified

- `src/capabilities/types.ts` - Added `CapabilityRegistrationOptions`.
- `src/capabilities/registry.ts` - Added unscored second-provider guardrail and `listScored()`.
- `src/eval/apply-results.ts` - Aggregates scored eval entries and applies quality metadata to registry entries.
- `src/eval/index.ts` - Exports eval result application helpers.
- `src/eval/run.ts` - Applies persisted eval run results back to the in-process registry.
- `tests/capabilities/registry-quality.test.ts` - Covers guardrail, model invalidation, and scored listing behavior.
- `tests/eval/apply-results.test.ts` - Covers score aggregation, skipped/error filtering, model mismatch, and provenance.
- `tests/eval/run-quality.test.ts` - Covers in-process registry quality after `runEval()`.
- `tests/eval/run.test.ts` - Hardened shared eval result cleanup for parallel Vitest files.
- `tests/eval/phase7.acceptance.test.ts` - Acceptance proof for Phase 7 routing preconditions.
- `tests/integration/image_op.runs.test.ts` - Marks duplicate fake provider registration as explicit non-production.
- `tests/integration/image_op.trace.test.ts` - Marks duplicate fake provider registration as explicit non-production.

## Decisions Made

- Kept built-in capability registration unchanged; the first provider for an op remains allowed to bootstrap without quality scores.
- Required non-empty `quality.scores` for second providers by default, with `allowUnscoredProduction` reserved for tests/development fakes.
- Applied eval results after JSON write so `quality.evalResultPath` points at the persisted artifact.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed parallel eval result cleanup race**
- **Found during:** Task 3 (Make npm run eval populate registry quality in-process and persist scored JSON)
- **Issue:** Adding `tests/eval/run-quality.test.ts` caused it to run in parallel with `tests/eval/run.test.ts`; both cleaned `eval/results/`, producing an `ENOTEMPTY` race.
- **Fix:** Added retrying recursive cleanup helpers in both eval runner test files.
- **Files modified:** `tests/eval/run.test.ts`, `tests/eval/run-quality.test.ts`
- **Verification:** `npm test -- tests/eval/run-quality.test.ts tests/eval/run.test.ts`
- **Committed in:** `59d04ac`

---

**Total deviations:** 1 auto-fixed (1 Rule 1)
**Impact on plan:** The fix was limited to test cleanup stability for the new shared eval-result test surface. Runtime behavior was unchanged.

## Issues Encountered

- `npm run eval` initially failed inside the sandbox because `tsx` could not create an IPC pipe under the system temp directory (`listen EPERM`). The command was rerun with approved escalation and passed. The same sandbox issue was documented in 07-01.

## Known Stubs

None.

## Verification

- `npm test -- tests/capabilities/registry-quality.test.ts tests/integration/image_op.runs.test.ts tests/integration/image_op.trace.test.ts` - passed, 13 tests.
- `npm test -- tests/eval/apply-results.test.ts` - passed, 4 tests.
- `npm test -- tests/eval/run-quality.test.ts tests/eval/run.test.ts` - passed, 5 tests.
- `npm test -- tests/eval/phase7.acceptance.test.ts` - passed, 4 tests.
- `npm test -- tests/eval tests/capabilities/registry-quality.test.ts` - passed, 27 tests.
- `npm run eval` - passed, wrote `eval/results/2026-05-02T20-57-22-357Z.json`.
- Latest eval result inspection - schemaVersion `1`, 5 scored `extract_subject/@imgly/local` entries, and 3 scored `edit_prompt/openai` entries in the current environment.
- `npm run build` - passed.
- Unscored second-provider guardrail - verified by acceptance test and direct marker check for `unscored; add an eval case before production routing`.

## User Setup Required

None - no external service configuration required for the registry and local eval score application. In this environment `OPENAI_API_KEY` was usable, so OpenAI edit eval cases scored during `npm run eval`; tests still cover missing/placeholder env behavior.

## Next Phase Readiness

Phase 9 planner routing can consume `capabilityRegistry.listScored()` and `quality.scores` populated by `runEval()`. Phase 11 provider breadth is protected by the second-provider guardrail: new alternatives cannot become production routing candidates without measured scores or an explicit non-production override.

## Self-Check: PASSED

- Summary file exists.
- Key created files exist: `src/eval/apply-results.ts`, `tests/capabilities/registry-quality.test.ts`, `tests/eval/apply-results.test.ts`, `tests/eval/run-quality.test.ts`, and `tests/eval/phase7.acceptance.test.ts`.
- Task commits found: `803bf38`, `5e4bde8`, `59d04ac`, and `41378a6`.

---
*Phase: 07-eval-harness-golden-set*
*Completed: 2026-05-02*
