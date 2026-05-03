---
phase: 11-provider-breadth-post-eval
plan: 02
subsystem: eval-routing
tags: [providers, eval, photoroom, fal, ideogram, trace, image-task]

requires:
  - phase: 11-provider-breadth-post-eval
    provides: provider adapters from Plan 01
provides:
  - deterministic eval cases for Photoroom, fal Flux Kontext, and Ideogram
  - generate-op eval runner support without input fixtures
  - trace-visible routing transparency metadata
  - Phase 11 eval workflow documentation
affects: [image_task, image_op, eval-harness, capability-registry, README]

tech-stack:
  added: []
  patterns:
    - eval cases stay deterministic with alpha_coverage, pixel_delta, and ocr_text_presence
    - executor computes route metadata from the same registry used for invocation
    - planner prompt vocabulary mirrors executor trace metadata

key-files:
  created:
    - eval/cases/photoroom.json
    - eval/cases/fal-flux-kontext.json
    - eval/cases/ideogram.json
  modified:
    - src/eval/run.ts
    - src/eval/scorers.ts
    - src/task/dag-executor.ts
    - src/task/planner.ts
    - README.md
    - tests/eval/cases.test.ts
    - tests/eval/run.test.ts
    - tests/eval/apply-results.test.ts
    - tests/task/dag-executor.test.ts
    - tests/task/planner.test.ts

key-decisions:
  - "Photoroom composite_layers eval keeps maxPixelDelta at 0.20 because Image Editing intentionally adds shadow/relighting."
  - "generate eval cases may omit params.input; pixel_delta still requires an inputPath if used."
  - "Trace routing transparency is computed in dag-executor from the resolved registry, not trusted from planner notes."

patterns-established:
  - "Phase 11 provider evals use requiredEnv gates so missing API keys skip cleanly."
  - "Trace metadata includes qualityMeasured on resolved capability routes, with optional qualityScores, noIncumbentComparison, and qualityUnavailable."

requirements-completed: [PROV-01, PROV-02, PROV-03, PROV-04, PROV-05]

duration: 10m 44s
completed: 2026-05-03
---

# Phase 11 Plan 02: Provider Breadth Post-Eval Summary

**Deterministic provider eval coverage and trace-visible routing evidence for Photoroom, fal Flux Kontext, and Ideogram.**

## Performance

- **Duration:** 10m 44s
- **Started:** 2026-05-03T20:54:49Z
- **Completed:** 2026-05-03T21:02:13Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Added Phase 11 eval cases for Photoroom `extract_subject`, Photoroom `composite_layers` with shadow, fal Flux Kontext `edit_prompt`, and Ideogram `generate`.
- Updated eval runner/scorers so generation cases can omit input images while `pixel_delta` still requires an input path.
- Added executor trace metadata: `qualityMeasured`, `qualityScores`, `noIncumbentComparison`, and `qualityUnavailable`.
- Documented Phase 11 eval workflow, displacement edges, `image_op` vs `image_task` policy, and Photoroom's two-adapter `(with shadow)` split.

## Task Commits

1. **Task 1: Add Phase 11 eval cases** - `d8f5cbd` (feat)
2. **Task 2 RED: Trace transparency tests** - `d78a8de` (test)
3. **Task 2 GREEN: Trace transparency implementation** - `75ec126` (feat)
4. **Task 3: README + apply-results smoke** - `46e9d11` (docs)

## Files Created/Modified

- `eval/cases/photoroom.json` - Three `extract_subject` cases and one `composite_layers` case with `params.shadow.enabled: true`.
- `eval/cases/fal-flux-kontext.json` - Two fal Flux Kontext cases mirroring OpenAI fixtures, including OCR-backed text edit scoring.
- `eval/cases/ideogram.json` - Two text-heavy `generate` cases using `ocr_text_presence` and `expectedText`.
- `src/eval/run.ts` - Allows `generate` eval cases without `params.input`.
- `src/eval/scorers.ts` - Makes missing `inputPath` an explicit `pixel_delta` scoring error.
- `src/task/dag-executor.ts` - Computes and emits routing transparency from the resolved capability registry.
- `src/task/planner.ts` - Adds prompt guidance for `routingNotes[i].measuredQuality` and "no incumbent comparison".
- `README.md` - Documents Phase 11 evals, scorer intent, displacement thresholds, and trace metadata.

## Decisions Made

- Kept Photoroom composite `maxPixelDelta` at `0.20`; no live calibration was run because provider API keys are not available in this execution environment.
- Used `composite-bg` plus `composite-overlay` for Photoroom composite evals to preserve fixture fairness with the existing sharp composite case.
- Added trace metadata on validation failures after capability resolution as well as invocation failures, so failed selected routes still expose measured/unmeasured context.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The Task 2 RED single-provider test initially exercised `generate` without a prompt, which fails validation before invocation. Implementation now computes routing transparency immediately after capability resolution so validation-failure traces are still informative.
- Live `npm run eval` was not run because `PHOTOROOM_API_KEY`, `FAL_KEY`, and `IDEOGRAM_API_KEY` are runtime credentials. The integration test proves `applyEvalResultsToRegistry` populates scores for `extract_subject:photoroom`, `composite_layers:photoroom`, `edit_prompt:fal`, and `generate:ideogram` from a synthetic scored result.

## TDD Gate Compliance

- RED commit present: `d78a8de` added failing trace transparency and planner prompt tests.
- GREEN commit present: `75ec126` implemented executor metadata and planner prompt changes.
- No refactor commit was needed.

## Known Stubs

None. Stub-pattern scan only found test helper defaults, existing troubleshooting text, and normal empty collection initialization.

## User Setup Required

Optional live eval credentials:

- `PHOTOROOM_API_KEY`
- `FAL_KEY`
- `IDEOGRAM_API_KEY`

With all three set, run `npm run eval` to produce live scored results and populate runtime `quality.scores`.

## Verification

- `npx vitest run tests/eval/cases.test.ts tests/eval/run.test.ts` passed: 18 tests.
- `npx vitest run tests/task/dag-executor.test.ts tests/task/planner.test.ts tests/task/serialize-response.test.ts && npm run build` passed during Task 2.
- `npx vitest run tests/eval/apply-results.test.ts && grep -c "Phase 11" README.md` passed.
- Plan-level verification passed: `npm run build` plus 8 targeted suites, 99 tests.
- Eval coverage check listed all new cases, including `composite_layers:photoroom -> pixel_delta`.
- Trace transparency grep returned 10 matches across `qualityMeasured`, `noIncumbentComparison`, `qualityUnavailable`, and `listScored`.

## Next Phase Readiness

Phase 11 provider breadth is ready for live credential-backed eval runs. Suggested follow-ups: add a dedicated shadow-presence scorer for Photoroom composite outputs, consider BFL direct Kontext coverage, and evaluate whether a broader fal platform abstraction is worth the extra surface.

## Self-Check: PASSED

- Summary file exists.
- Created eval case files exist.
- Task commits found: `d8f5cbd`, `d78a8de`, `75ec126`, `46e9d11`.

---
*Phase: 11-provider-breadth-post-eval*
*Completed: 2026-05-03*
