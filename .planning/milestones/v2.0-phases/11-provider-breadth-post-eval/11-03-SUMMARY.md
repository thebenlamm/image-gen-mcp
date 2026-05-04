---
phase: 11-provider-breadth-post-eval
plan: 03
subsystem: providers
tags: [providers, photoroom, capability-registry, eval, gap-closure]

requires:
  - phase: 11-provider-breadth-post-eval
    provides: Phase 11 provider adapters and eval result application from Plans 01-02
provides:
  - Photoroom composite_layers single-subject Image Editing API contract
  - Photoroom composite eval case aligned to alpha_coverage without params.input
  - eval-time case-to-adapter contract lint for requiresInputImage=false mismatches
  - README live verification path for PROV-01 and PROV-05
affects: [image_op, image_task, eval-harness, capability-registry, README]

tech-stack:
  added: []
  patterns:
    - Photoroom composite_layers is a single-subject Image Editing API adapter, not a multi-layer compositor.
    - Eval cases using alpha_coverage may omit params.input; pixel_delta remains the scorer that requires an input baseline.
    - runEval rejects semantically mismatched eval cases before provider invocation and scoring.

key-files:
  created:
    - .planning/phases/11-provider-breadth-post-eval/11-03-SUMMARY.md
  modified:
    - src/capabilities/photoroom-composite-layers.ts
    - tests/capabilities/photoroom-composite-layers.test.ts
    - eval/cases/photoroom.json
    - src/eval/run.ts
    - tests/eval/run.test.ts
    - tests/eval/cases.test.ts
    - tests/eval/apply-results.test.ts
    - README.md

key-decisions:
  - "Option A was applied: composite_layers:photoroom is narrowed to Photoroom's actual single-subject Image Editing API contract."
  - "Photoroom composite eval uses alpha_coverage on provider output instead of pixel_delta against an unused params.input baseline."
  - "Malformed eval cases with params.input against requiresInputImage=false capabilities are recorded as errors before invocation."

patterns-established:
  - "Adapter-specific constraints can narrow shared op schema after validateCapabilityParams accepts the common shape."
  - "Eval contract lint belongs after capability resolution and before invocation so invalid cases cannot populate quality.scores."

requirements-completed: [PROV-01, PROV-05]

duration: 7m 16s
completed: 2026-05-03
---

# Phase 11 Plan 03: Provider Breadth Gap Closure Summary

**Photoroom composite_layers now matches the single-subject Image Editing API contract, with alpha_coverage eval evidence and a pre-invocation contract guard.**

## Performance

- **Duration:** 7m 16s
- **Started:** 2026-05-03T22:45:56Z
- **Completed:** 2026-05-03T22:52:52Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Narrowed `composite_layers:photoroom` to `requiresInputImage: false`, `supportsMultipleInputs: false`, exactly one subject layer, and no custom `imageGenMcp.layers` form field.
- Realigned `composite-photoroom-product-with-shadow` to the adapter's consumed shape: `canvas`, one `layers[0].input`, `shadow.enabled: true`, no `params.input`, and `alpha_coverage`.
- Added a `runEval` case-to-adapter lint that records `case→adapter contract mismatch` before invocation when a case supplies `params.input` but the resolved capability declares `requiresInputImage=false`.
- Updated registry score regression coverage and README docs so live PROV-01/PROV-05 verification can run without further code changes.

## Task Commits

1. **Task 1: Narrow Photoroom composite_layers adapter** - `694ed9a` (fix)
2. **Task 2: Realign eval case and add contract lint** - `16397f0` (fix)
3. **Task 3: Update apply-results regression and README** - `a5dfbe0` (docs)

## Files Created/Modified

- `src/capabilities/photoroom-composite-layers.ts` - Flipped constraints, added single-layer enforcement, removed `imageGenMcp.layers`, preserved Image Editing metadata and shadow fields.
- `tests/capabilities/photoroom-composite-layers.test.ts` - Added contract, multi-layer rejection, no custom form field, and no API-key-in-error assertions.
- `eval/cases/photoroom.json` - Removed orphan `params.input`/`maxPixelDelta` and switched composite scoring to `alpha_coverage`.
- `src/eval/run.ts` - Added the pre-invocation contract lint and allowed input-free non-`pixel_delta` scoring.
- `tests/eval/run.test.ts` - Renamed Photoroom composite test to `alpha_coverage` and added the invalid-composite-case lint regression.
- `tests/eval/cases.test.ts` - Updated the Photoroom composite case expectation to no `params.input` and `alpha_coverage`.
- `tests/eval/apply-results.test.ts` - Updated composite_layers:photoroom quality score proof to `{ alpha_coverage: 0.95 }`.
- `README.md` - Documented the single-subject contract, alpha_coverage rationale, trace example, and live verification command sequence.

## Decisions Made

- Used Option A from the plan: Photoroom composite is a single-subject product photography adapter, while multi-layer placement remains the responsibility of `composite_layers:sharp`.
- Kept `MODEL_VERSION = 'photoroom-image-editing-v1'` unchanged so eval result application still keys the same registry entry.
- Kept live Photoroom output behavior unobserved in this environment; if Photoroom returns fully opaque PNGs, `alpha_coverage` may saturate at `1.0`, which remains a valid clean-output/no-holes routing signal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Allowed input-free eval cases for non-pixel_delta scorers**
- **Found during:** Task 2 (targeted eval runner tests)
- **Issue:** `getInputPath` still threw for any non-generate case without `params.input`, even though the new Photoroom composite case uses `alpha_coverage`, which only needs `outputPath`.
- **Fix:** Updated `getInputPath` to return `undefined` when the case does not include `pixel_delta`; `pixel_delta` still requires an input baseline.
- **Files modified:** `src/eval/run.ts`, `tests/eval/run.test.ts`
- **Verification:** `npx vitest run tests/eval/run.test.ts tests/eval/cases.test.ts` passed.
- **Committed in:** `16397f0`

---

**Total deviations:** 1 auto-fixed (Rule 1).
**Impact on plan:** Necessary for the planned alpha_coverage contract; no scope expansion.

## Issues Encountered

- The invalid-case lint regression initially hit the existing "eval completed without scored cases" guard before the failed-case assertion. The test now includes one valid local scored case so it proves the malformed Photoroom composite case is recorded as an error and never invokes the capability.
- Live provider evals were not run because `PHOTOROOM_API_KEY`, `FAL_KEY`, and `IDEOGRAM_API_KEY` are external credentials.

## Known Stubs

None. Stub-pattern scan only found test helper defaults, existing placeholder-env tests, troubleshooting copy, and normal empty collection initialization.

## User Setup Required

Optional live verification credentials:

- `PHOTOROOM_API_KEY`
- `FAL_KEY`
- `IDEOGRAM_API_KEY`

README now includes the exact sequence:

```bash
PHOTOROOM_API_KEY=sk-... \
FAL_KEY=fal_... \
IDEOGRAM_API_KEY=... \
npm run eval
```

Then start the MCP server, inspect `list_capabilities` for non-empty scores on all four Phase 11 surfaces, and run a best-tier product-photography `image_task` to confirm the trace selects `composite_layers:photoroom` with `metadata.api="image-editing"`, `metadata.shadowApplied=true`, and non-empty `metadata.qualityScores`.

If `npm run eval` reports `case→adapter contract mismatch`, fix the case JSON so it matches the resolved capability constraints before re-running.

## Verification

- `npx vitest run tests/capabilities/photoroom-composite-layers.test.ts` passed: 7 tests.
- `npx vitest run tests/eval/run.test.ts tests/eval/cases.test.ts` passed: 19 tests.
- `npx vitest run tests/eval/apply-results.test.ts` passed: 5 tests.
- `npm run build` passed after each task and in the final plan-level sweep.
- Plan-level targeted sweep passed: 4 files, 31 tests.
- `npm test` passed: 48 files, 295 tests, 0 failed.
- Contract checks passed: `requiresInputImage: false` present, `imageGenMcp.layers` count is `0`, composite Photoroom case has no `params.input`, scorer is `alpha_coverage`, README contains live verification and single-subject docs.

## Threat Flags

None. This plan reduced provider/eval trust-boundary risk by rejecting mismatched eval cases before invocation and by keeping API keys out of adapter metadata/error assertions.

## Next Phase Readiness

PROV-01 and PROV-05 are unblocked on automated grounds. The remaining gate is live human verification with real provider credentials. Cost calibration follow-up remains pending: record the actual Photoroom Image Editing per-call price observed during live eval versus the current `$0.05` placeholder.

## Self-Check: PASSED

- Summary file exists.
- Key modified files exist.
- Task commits found: `694ed9a`, `16397f0`, `a5dfbe0`.

---
*Phase: 11-provider-breadth-post-eval*
*Completed: 2026-05-03*
