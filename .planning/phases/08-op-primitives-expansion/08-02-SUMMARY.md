---
phase: 08-op-primitives-expansion
plan: 02
subsystem: capabilities
tags: [sharp, tesseract, replicate, eval, ocr]

requires:
  - phase: 08-op-primitives-expansion
    provides: discriminated capability result contract, CapabilityInvokeError, unscored justification enforcement
provides:
  - composite_layers sharp capability with bounded canvas, layer count, scale, opacity, and anchor semantics
  - enhance_upscale Replicate Real-ESRGAN capability with input/output megapixel guards and unscored production justification
  - analyze_ocr tesseract capability with shared pooled worker lifecycle
  - OCR utility shared by eval scoring and user-facing capability invocation
  - deterministic eval cases and fixtures for composite_layers and analyze_ocr
affects: [09-image-task-planner-dag, eval-harness, capability-registry]

tech-stack:
  added: []
  patterns:
    - "OCR has per-call eval mode and pooled capability mode from one utility"
    - "Image composition is implemented as one sharp composite call"
    - "Replicate capabilities gate API-token availability at registration time"

key-files:
  created:
    - src/utils/ocr.ts
    - src/capabilities/composite-layers.ts
    - src/capabilities/enhance-upscale.ts
    - src/capabilities/analyze-ocr.ts
    - eval/cases/composite-layers.json
    - eval/cases/analyze-ocr.json
    - eval/fixtures/composite-bg.png
    - eval/fixtures/composite-overlay.png
    - eval/fixtures/composite-golden.png
  modified:
    - src/capabilities/register.ts
    - src/capabilities/validation.ts
    - src/eval/scorers.ts
    - src/eval/fixtures.ts
    - scripts/run-eval.ts

key-decisions:
  - "OCR pooling is language-keyed and explicit via terminatePool(), while eval scoring uses per-call recognizeOnce()."
  - "composite_layers preserves array order as z-order and keeps v1 scope to scale, opacity, anchor, and position."
  - "enhance_upscale ships as an unscored production capability with quality.unscoredJustification because external Replicate scoring is deferred."

patterns-established:
  - "Data capabilities return kind:'data' and never write image artifacts."
  - "Capability boundary validation rejects expensive work before sharp, tesseract, or HTTP calls."
  - "Eval cases can target data-returning capability outputs in addition to image artifacts."

requirements-completed: [PRIM-03, PRIM-05, PRIM-08]

duration: 45min
completed: 2026-05-03
---

# Phase 08 Plan 02: Remaining Op Primitives Summary

**Composite, upscale, and OCR capabilities with shared OCR lifecycle and deterministic eval coverage**

## Performance

- **Duration:** 45 min
- **Started:** 2026-05-03T00:38:00Z
- **Completed:** 2026-05-03T01:23:00Z
- **Tasks:** 4
- **Files modified:** 21

## Accomplishments

- Extracted tesseract handling into `src/utils/ocr.ts` with `recognizeOnce`, `recognizePooled`, and `terminatePool`, then refactored OCR eval scoring to use the shared utility.
- Added `composite_layers`, `enhance_upscale`, and `analyze_ocr` capabilities with registration, validation, tests, and error handling aligned to the Phase 8 contract.
- Added composite and OCR eval cases/fixtures, including manifest updates and data-result OCR scorer support.

## Task Commits

1. **Task 1 RED:** `75c704e` test(08-02): add failing OCR utility tests
2. **Task 1 GREEN:** `78b7389` feat(08-02): extract shared OCR worker utility
3. **Task 2 RED:** `80961d2` test(08-02): add failing composite layers tests
4. **Task 2 GREEN:** `4f95902` feat(08-02): add composite layers capability
5. **Task 3 RED:** `7c35e18` test(08-02): add failing enhance upscale tests
6. **Task 3 GREEN:** `61e7188` feat(08-02): add Replicate upscale capability
7. **Task 4 RED:** `9b4c1bf` test(08-02): add failing analyze OCR tests
8. **Task 4 GREEN:** `71dd17e` feat(08-02): add analyze OCR capability

## Files Created/Modified

- `src/utils/ocr.ts` - Shared tesseract worker lifecycle with per-call and pooled recognition modes.
- `src/capabilities/composite-layers.ts` - Sharp-backed layer compositing capability using one composite call.
- `src/capabilities/enhance-upscale.ts` - Replicate Real-ESRGAN upscale capability with API-token gating, megapixel limits, timeout, retry, and metadata.
- `src/capabilities/analyze-ocr.ts` - Tesseract-backed data capability returning OCR text, confidence, and optional word boxes.
- `src/eval/scorers.ts` - OCR scorer delegation to `recognizeOnce` plus data-result OCR scoring support.
- `eval/cases/*` and `eval/fixtures/*` - Composite and OCR deterministic eval coverage.

## Decisions Made

The plan was implemented as specified. The only notable execution decision was to keep OCR eval worker lifecycle separate from pooled capability lifecycle so eval runs remain isolated while repeated `analyze_ocr` calls benefit from reuse.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

OCR work is inherently slow because tesseract initialization dominates test and eval runtime. The implementation keeps those costs explicit and provides pooling for capability invocation.

## Known Stubs

`enhance_upscale` depends on `REPLICATE_API_TOKEN`; without it, the capability is not registered. This follows the existing optional-provider pattern.

## Threat Flags

None beyond the plan threat model. Validation rejects large images, excessive layers, and invalid scaling before expensive local or remote work begins.

## User Setup Required

Optional: set `REPLICATE_API_TOKEN` to enable `enhance_upscale` at runtime.

## Verification

- Task-level TDD commits exist for OCR utility, composite_layers, enhance_upscale, and analyze_ocr.
- Created capability and eval files exist on disk.
- Plan-level build/test/eval verification is run by the phase orchestrator after summary creation.

## Next Phase Readiness

Phase 9 can plan across the complete primitive set: transform, composite_layers, enhance_upscale, analyze_dimensions, analyze_palette, analyze_ocr, extract_subject, and edit_prompt. It can also inspect `list_capabilities` for cost, latency, and quality metadata.

## Self-Check: PASSED

- Created files exist.
- Task commits exist.
- No tracked files were accidentally deleted.

---
*Phase: 08-op-primitives-expansion*
*Completed: 2026-05-03*
