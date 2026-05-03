---
phase: 11-provider-breadth-post-eval
plan: 01
subsystem: capabilities
tags: [providers, photoroom, fal, ideogram, capability-registry, image-op]

requires:
  - phase: 07-eval-harness-golden-set
    provides: capability registry quality gates and eval score application
  - phase: 10-template-fast-paths-executor-parallelism
    provides: template validation against the registry
provides:
  - generate CapabilityOp surface with Ideogram provider support
  - Photoroom extract_subject and composite_layers capability adapters
  - fal Flux Kontext edit_prompt capability adapter
  - registry wiring and README docs for Phase 11 provider breadth
affects: [image_op, image_task, capability-registry, eval-cases, templates]

tech-stack:
  added: []
  patterns:
    - API-key-gated capability factories return null when env vars are absent or placeholder values
    - Second providers register with allowUnscoredProduction and non-empty audit justifications
    - Remote providers return provider/modelVersion/qualityMeasured metadata

key-files:
  created:
    - src/capabilities/photoroom-extract-subject.ts
    - src/capabilities/photoroom-composite-layers.ts
    - src/capabilities/fal-edit-prompt.ts
    - src/capabilities/ideogram-generate.ts
    - tests/capabilities/photoroom-extract-subject.test.ts
    - tests/capabilities/photoroom-composite-layers.test.ts
    - tests/capabilities/fal-edit-prompt.test.ts
    - tests/capabilities/ideogram-generate.test.ts
  modified:
    - src/capabilities/types.ts
    - src/capabilities/validation.ts
    - src/capabilities/register.ts
    - src/task/plan-schema.ts
    - src/task/plan-validator.ts
    - src/eval/cases.ts
    - src/index.ts
    - tests/task/plan-validator.test.ts
    - tests/capabilities/registry-quality.test.ts
    - tests/task/templates.test.ts
    - README.md

key-decisions:
  - "Photoroom Remove Background uses current documented sdk.photoroom.com/v1/segment with x-api-key."
  - "Ideogram v3 generate uses multipart form data and downloads ephemeral URLs immediately."
  - "fetchWithTimeoutRetry was inlined in fal and Ideogram adapters; no shared util was added in this plan."

patterns-established:
  - "Provider adapter metadata includes provider, modelVersion, and qualityMeasured for Plan 02 trace enrichment."
  - "Photoroom composite_layers is the shadow/relighting surface for PROV-01; extract_subject remains a flat alpha cutout."

requirements-completed: [PROV-01, PROV-02, PROV-03, PROV-04]

duration: 10m 26s
completed: 2026-05-03
---

# Phase 11 Plan 01: Provider Breadth Adapter Summary

**Capability-routed Photoroom, fal Flux Kontext, and Ideogram adapters with guarded registration and generate-op validation.**

## Performance

- **Duration:** 10m 26s
- **Started:** 2026-05-03T20:41:52Z
- **Completed:** 2026-05-03T20:52:18Z
- **Tasks:** 5
- **Files modified:** 22

## Accomplishments

- Added `generate` across capability types, plan schema, eval case validation, `image_op`, and plan validation.
- Added four remote capability adapters: `extract_subject:photoroom`, `composite_layers:photoroom`, `edit_prompt:fal`, and `generate:ideogram`.
- Wired adapters into `registerBuiltInCapabilities()` with API-key gating and preserved the unscored second-provider guard.
- Documented `PHOTOROOM_API_KEY`, `FAL_KEY`, `IDEOGRAM_API_KEY`, and the Photoroom `(with shadow)` split in README.

## Task Commits

1. **Task 0: Add generate capability surface** - `77ee762` (feat)
2. **Task 1: Add Photoroom capability adapters** - `24ae3a9` (feat)
3. **Task 2: Add fal edit_prompt adapter** - `919c550` (feat)
4. **Task 3: Add Ideogram generate adapter** - `0282eeb` (feat)
5. **Task 4: Register provider breadth adapters** - `aa9bea6` (feat)

## Files Created/Modified

- `src/capabilities/photoroom-extract-subject.ts` - Photoroom Remove Background adapter using `https://sdk.photoroom.com/v1/segment`.
- `src/capabilities/photoroom-composite-layers.ts` - Photoroom Image Editing adapter using `https://image-api.photoroom.com/v2/edit` with optional shadow/background params.
- `src/capabilities/fal-edit-prompt.ts` - fal Flux Kontext adapter using queue submission, polling, response fetch, and image URL download.
- `src/capabilities/ideogram-generate.ts` - Ideogram v3 generate adapter using multipart form data and ephemeral URL download.
- `src/capabilities/register.ts` - Registers Photoroom, fal, and Ideogram when relevant API keys are present.
- `README.md` - Documents env vars, capability/provider rows, and Phase 11 routing caveat.

## Decisions Made

- Used current Photoroom docs for Remove Background: `sdk.photoroom.com/v1/segment` plus `x-api-key`; the plan/patterns referenced an older expected `image-api.photoroom.com/v2/segment` surface.
- Kept Photoroom Image Editing request schema intentionally minimal: first layer as `imageFile`, `removeBackground=true`, `outputSize`, optional `shadow.mode`, optional `background.*`, and an internal serialized layer placement field for traceability.
- Used Ideogram multipart form data because the current v3 generate docs specify multipart fields, while examples also show JSON for simple calls.
- Inlined `fetchWithTimeoutRetry` in fal and Ideogram adapters to keep the change localized.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Used current Photoroom Remove Background endpoint**
- **Found during:** Task 1
- **Issue:** Plan expected `https://image-api.photoroom.com/v2/segment`, but current Photoroom API docs list Remove Background at `https://sdk.photoroom.com/v1/segment`.
- **Fix:** Implemented the documented endpoint with `x-api-key` auth and multipart `image_file`.
- **Files modified:** `src/capabilities/photoroom-extract-subject.ts`
- **Verification:** Photoroom adapter tests and `npm run build` passed.
- **Committed in:** `24ae3a9`

**2. [Rule 2 - Missing Critical] Used Ideogram multipart request format**
- **Found during:** Task 3
- **Issue:** Plan body described JSON, but current Ideogram v3 API reference specifies multipart form fields for `/v1/ideogram-v3/generate`.
- **Fix:** Implemented `FormData` with `prompt`, `aspect_ratio`, `rendering_speed`, and `num_images`.
- **Files modified:** `src/capabilities/ideogram-generate.ts`
- **Verification:** Ideogram adapter tests and `npm run build` passed.
- **Committed in:** `0282eeb`

---

**Total deviations:** 2 auto-fixed (2 Rule 2).
**Impact on plan:** Both changes align adapters with current provider APIs while preserving the planned capability contracts.

## Issues Encountered

- The first `generate` output-kind mismatch test used a data terminal node, which triggered the existing `TERMINAL_INVALID` ordering before the intended mismatch assertion. The test was reshaped so the invalid `generate` node is non-terminal.
- No authentication gates occurred; all provider tests use mocked `fetch` and env vars.

## Known Stubs

None. Stub-pattern scan returned only test helper defaults, existing validator arrays, and existing README troubleshooting text.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: outbound-network | `src/capabilities/photoroom-extract-subject.ts` | New remote provider call to Photoroom Remove Background API. |
| threat_flag: outbound-network | `src/capabilities/photoroom-composite-layers.ts` | New remote provider call to Photoroom Image Editing API. |
| threat_flag: outbound-network | `src/capabilities/fal-edit-prompt.ts` | New remote provider queue/poll/download flow for fal Flux Kontext. |
| threat_flag: outbound-network | `src/capabilities/ideogram-generate.ts` | New remote provider generate/download flow for Ideogram v3. |

## User Setup Required

Optional API keys enable the new providers:

- `PHOTOROOM_API_KEY` for `extract_subject:photoroom` and `composite_layers:photoroom`
- `FAL_KEY` for `edit_prompt:fal`
- `IDEOGRAM_API_KEY` for `generate:ideogram`

## Verification

- `npm run build` passed after Task 0 before adapters were written.
- `npx vitest run tests/task/plan-validator.test.ts` passed after Task 0.
- `npx vitest run tests/capabilities/photoroom-extract-subject.test.ts tests/capabilities/photoroom-composite-layers.test.ts` passed.
- `npx vitest run tests/capabilities/fal-edit-prompt.test.ts` passed.
- `npx vitest run tests/capabilities/ideogram-generate.test.ts` passed.
- `npm run build` passed after Task 4.
- `npx vitest run tests/capabilities/ tests/task/plan-validator.test.ts tests/task/templates.test.ts tests/task/plan-schema.test.ts tests/eval/cases.test.ts` passed: 17 files, 122 tests.

## Notes for Plan 02

- Registered capabilities with keys present should include `extract_subject:photoroom`, `composite_layers:photoroom`, `edit_prompt:fal`, and `generate:ideogram`.
- `metadata.qualityMeasured` is currently `false`; Plan 02 should flip route transparency to measured once eval result scores are applied.
- `composite_layers:photoroom` should map D-15 scoring to shadow/background quality and subject preservation. `extract_subject:photoroom` should focus on alpha edge and subject preservation only.
- Cost calibration remains needed: Photoroom Image Editing uses the plan placeholder `0.05` per call because no live billing call was made during mocked tests.

## Next Phase Readiness

Plan 02 can add eval cases and trace enrichment against the new provider surfaces. Shared `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally not updated because the orchestrator owns shared phase state.

## Self-Check: PASSED

- Summary file exists.
- All four provider adapter files and their direct test files exist.
- Task commits found: `77ee762`, `24ae3a9`, `919c550`, `0282eeb`, `aa9bea6`.

---
*Phase: 11-provider-breadth-post-eval*
*Completed: 2026-05-03*
