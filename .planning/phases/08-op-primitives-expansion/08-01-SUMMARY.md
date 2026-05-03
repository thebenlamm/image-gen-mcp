---
phase: 08-op-primitives-expansion
plan: 01
subsystem: capabilities
tags: [capability-registry, image_op, sharp, eval, mcp]

requires:
  - phase: 07-eval-harness-golden-set
    provides: eval harness, fixture manifest, quality-score application
provides:
  - Discriminated CapabilityInvokeResult contract with image/data branches
  - CapabilityInvokeError with structured retry metadata
  - transform, analyze_dimensions, and analyze_palette sharp capabilities
  - list_capabilities MCP tool and data-result image_op behavior
  - deterministic eval cases and fixtures for analyze_dimensions/analyze_palette
affects: [08-op-primitives-expansion, 09-image-task-planner-dag]

tech-stack:
  added: []
  patterns:
    - "Capability results branch on kind before writing artifacts"
    - "Data-returning capabilities return typed data and do not consume output paths"
    - "allowUnscoredProduction requires quality.unscoredJustification"

key-files:
  created:
    - src/capabilities/transform.ts
    - src/capabilities/analyze-dimensions.ts
    - src/capabilities/analyze-palette.ts
    - eval/cases/analyze-dimensions.json
    - eval/cases/analyze-palette.json
    - eval/fixtures/dims-256x128.png
    - eval/fixtures/palette-three-bands.png
  modified:
    - src/capabilities/types.ts
    - src/capabilities/registry.ts
    - src/capabilities/extract-subject.ts
    - src/capabilities/edit-prompt.ts
    - src/capabilities/register.ts
    - src/capabilities/validation.ts
    - src/index.ts
    - src/eval/cases.ts
    - src/eval/fixtures.ts
    - src/eval/run.ts
    - src/eval/scorers.ts
    - src/eval/types.ts

key-decisions:
  - "image_op response errors are now structured as error.message/code/retryable/suggestion, while manifest.error remains a string."
  - "Fixture catalog size is now 12 because Phase 8 adds two deterministic analysis fixtures."
  - "ProcessingOperation remains declared in src/utils/processing.ts and is re-exported from src/capabilities/types.ts."

patterns-established:
  - "Analyze result types carry inner type discriminants: dimensions, palette, ocr."
  - "list_capabilities serializes capability metadata by construction, excluding invoke."
  - "Phase 8 local capabilities throw CapabilityInvokeError for actionable validation/provider failures."

requirements-completed: [PRIM-04, PRIM-06, PRIM-07]

duration: 36min
completed: 2026-05-03
---

# Phase 08 Plan 01: Op Primitives Contract Summary

**Capability result contract with sharp transform/analysis primitives, data-aware image_op responses, list_capabilities discovery, and deterministic analyze eval cases**

## Performance

- **Duration:** 36 min
- **Started:** 2026-05-03T00:00:00Z
- **Completed:** 2026-05-03T00:36:31Z
- **Tasks:** 3
- **Files modified:** 31

## Accomplishments

- Replaced `CapabilityInvokeResult` with `kind: 'image' | 'data'`, added stable analyze result types, `CapabilityInvokeError`, `idempotencyKey?`, `unscoredJustification?`, and the `ProcessingOperation` re-export.
- Added and registered `transform`, `analyze_dimensions`, and `analyze_palette` with sharp-backed behavior, maxOps/count validation, deterministic fixtures, and exact eval scorers/cases.
- Updated `image_op` to save only image results, return data results without artifacts/output copies, surface structured error payloads, and added `list_capabilities`.

## Task Commits

1. **Task 1 RED:** `f23fcca` test(08-01): add failing capability contract tests
2. **Task 1 GREEN:** `ac08083` feat(08-01): implement capability result contract
3. **Task 2 RED:** `a2c4567` test(08-01): add failing sharp capability tests
4. **Task 2 GREEN:** `1027b97` feat(08-01): add sharp transform and analysis capabilities
5. **Task 3 RED:** `4a225a6` test(08-01): add failing image_op data integration tests
6. **Task 3 GREEN:** `fe3a9a6` feat(08-01): add image_op data responses and capability listing
7. **Verification fix:** `9e19187` test(08-01): update eval tests for capability contract

## Files Created/Modified

- `src/capabilities/types.ts` - Public capability contract, data result types, structured error class, and `ProcessingOperation` re-export.
- `src/capabilities/transform.ts` - `sharp-transform@1` shim over `applyOperations()` with `maxOps=16`.
- `src/capabilities/analyze-dimensions.ts` - `sharp-metadata@1` data capability.
- `src/capabilities/analyze-palette.ts` - `sharp-palette@1` weighted color bucket capability.
- `src/index.ts` - `image_op` kind branching, structured error payloads, and `list_capabilities`.
- `src/eval/*` and `eval/cases/*` - Exact-match dimensions/palette scorers, data-result eval support, and new cases.

## Decisions Made

Manifest errors remain string-only for disk stability; structured fields are returned in the `image_op` response for Phase 9 planner retry logic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Moved eval/image_op kind branches into the contract commit**
- **Found during:** Task 1
- **Issue:** `npx tsc --noEmit` failed because `src/index.ts` and `src/eval/run.ts` still read `invokeResult.buffer` directly after the union contract landed.
- **Fix:** Added `result.kind` branches and data-result scorer plumbing before committing the contract implementation.
- **Files modified:** `src/index.ts`, `src/eval/run.ts`, `src/eval/scorers.ts`, `src/eval/types.ts`
- **Verification:** `npm run build`, `npx tsc --noEmit`
- **Committed in:** `ac08083`

**2. [Rule 1 - Bug] Updated eval fixture-count invariant**
- **Found during:** Task 2 `npm run eval`
- **Issue:** `loadFixtures()` still required exactly 10 fixtures; Task 2 intentionally added two deterministic fixtures.
- **Fix:** Updated fixture loader and fixture/acceptance tests to require 12 fixtures while preserving category coverage.
- **Files modified:** `src/eval/fixtures.ts`, `tests/eval/fixtures.test.ts`, `tests/eval/phase7.acceptance.test.ts`
- **Verification:** `npm run eval`, `npx vitest run --reporter=basic`
- **Committed in:** `1027b97`

**3. [Rule 1 - Bug] Updated eval tests for the new contract**
- **Found during:** Plan-level full test run
- **Issue:** Some eval tests returned fake capability results without `kind`, omitted D-09 justifications, or had a stale scorer allowlist.
- **Fix:** Added `kind: 'image'` fake results, unscored justifications, and new exact scorers to the allowlist.
- **Files modified:** `tests/eval/cases.test.ts`, `tests/eval/run.test.ts`, `tests/eval/run-quality.test.ts`
- **Verification:** `npx vitest run --reporter=basic`
- **Committed in:** `9e19187`

---

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 3)
**Impact on plan:** All fixes were required to keep the new contract buildable and the existing eval suite coherent. No scope beyond 08-01 behavior.

## Issues Encountered

`npm run eval` takes noticeably longer than the unit tests because existing OCR eval cases still initialize tesseract workers. The eval completed successfully.

## Known Stubs

None.

## Threat Flags

None beyond the plan threat model; the new data-result path avoids artifact/output writes and is covered by integration tests.

## User Setup Required

None - no external service configuration required.

## Verification

- `npm run build` passed.
- `npx tsc --noEmit` passed.
- `npx vitest run --reporter=basic` passed: 21 files, 80 tests.
- `npm run eval` passed and wrote `eval/results/2026-05-03T00-35-44-817Z.json`.
- Plan-level contract, registration, kind-branch, scorer, fixture, and `'generate'` removal greps passed.

## Next Phase Readiness

08-02 should read this summary first. It can rely on `CapabilityInvokeResult.kind`, `CapabilityInvokeError`, `idempotencyKey?`, `quality.unscoredJustification?`, and `list_capabilities` as stable 08-01 contract surface.

## Self-Check: PASSED

- Created files exist.
- Task commits exist.
- No tracked files were accidentally deleted.

---
*Phase: 08-op-primitives-expansion*
*Completed: 2026-05-03*
