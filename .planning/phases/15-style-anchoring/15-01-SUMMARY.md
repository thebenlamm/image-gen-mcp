---
phase: 15-style-anchoring
plan: "01"
subsystem: image-generation
tags: [style-anchoring, reference-image, edit-prompt, generate-image, generate-batch]
dependency_graph:
  requires: [capabilities/edit-prompt.ts, capabilities/registry.ts]
  provides: [reference_image param in generate_image, reference_image param in generate_batch]
  affects: [src/index.ts, src/batch.ts]
tech_stack:
  added: []
  patterns: [capability routing, vi.hoisted() for vitest mock hoisting]
key_files:
  created:
    - tests/integration/generate_image_style.test.ts
  modified:
    - src/index.ts
    - src/batch.ts
    - tests/integration/generate_batch.test.ts
decisions:
  - Export handleGenerateImage() as a named function for direct test invocation, following the handleImageOp pattern
  - Use vi.hoisted() to define mock functions so they're initialized before vi.mock() factories run
  - Style-anchor branch in handleGenerateImage placed before resolveProvider() so v1 path is untouched
  - Per-item catch block in batch.ts uses reference_image presence to set provider field in error result
metrics:
  duration_minutes: 5
  tasks_completed: 3
  files_changed: 4
  tests_added: 21
  completed_date: "2026-05-11"
requirements:
  - STYLE-01
  - STYLE-02
  - STYLE-03
---

# Phase 15 Plan 01: Style Anchoring — generate_image and generate_batch

**Status**: complete
**Tasks completed**: 3/3
**One-liner**: Route generate_image and generate_batch through edit_prompt:openai (gpt-image-1.5) when reference_image is set, enabling scene geometry and lighting anchoring from a reference image.

## Changes

### Created
- `tests/integration/generate_image_style.test.ts` — 7 test cases for generate_image style-anchor path (happy path, model warning, missing capability, CapabilityInvokeError propagation, size passthrough, v1 regression)

### Modified
- `src/index.ts` — Extracted generate_image handler into exported `handleGenerateImage(args: GenerateImageArgs)` function; added `reference_image?: string` to GenerateImageArgs interface and Zod schema; added style-anchor branch before resolveProvider(); added `reference_image?: string` to generate_batch Zod schema
- `src/batch.ts` — Added `capabilityRegistry` import; added `reference_image?: string` to GenerateBatchArgs; added `routedVia?: 'edit_prompt'` to BatchItemResult; per-item branch routes through capabilityRegistry.get('edit_prompt','openai') when reference_image set; batch-level response includes routedVia and referenceImage when set
- `tests/integration/generate_batch.test.ts` — Added capabilities mock using vi.hoisted() + vi.mock(); added 4 style-anchor test cases (all-items routing, per-item isolation, missing capability, v1 regression)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | f30377e | feat(15-01): add reference_image style-anchor to generate_image |
| 2 | edf09e0 | feat(15-01): add reference_image style-anchor to generate_batch |
| 3 | 2ddcd3c | test(15-01): add style-anchor tests for generate_image and generate_batch |

## Notes

**handleGenerateImage extraction**: The generate_image handler was extracted into a named exported function (handleGenerateImage) following the same pattern as handleImageOp. This enables direct handler invocation in tests without MCP server setup, and keeps the server.tool() registration as a thin delegating call.

**vi.hoisted() pattern**: Vitest hoists vi.mock() calls to the top of the file, causing TDZ (temporal dead zone) errors when mock factories reference variables declared with const/let below them. Using vi.hoisted() ensures mock function instances are initialized before the hoisted factory runs.

**Threat mitigations verified**:
- T-15-02 (path traversal): delegated to assertWithinInputRoot() inside edit_prompt capability
- T-15-05 (key disclosure): error messages reference key absence, never the key value

## Deviations from Plan

### Auto-adjustments

**1. [Rule 2 - Missing functionality] Exported handleGenerateImage for testability**
- **Found during**: Task 3
- **Issue**: The plan specified testing via "createServer() or importing the handler" — but generate_image was registered inline in server.tool() with no exported handler. Testing through the MCP server dispatch would require HTTP setup; the existing test pattern (handleImageOp) uses exported functions.
- **Fix**: Extracted handler into exported `handleGenerateImage()` before `registerTools()`, following the established pattern. Server registration delegates: `(args) => handleGenerateImage(args)`.
- **Files modified**: src/index.ts
- **Commit**: f30377e

**2. [Rule 1 - Bug] vi.hoisted() required for mock initialization**
- **Found during**: Task 3 (first test run)
- **Issue**: `vi.mock()` factory referenced `mockCapGet` / `mockGet` declared as const before the factory — but since vi.mock() is hoisted, those variables weren't initialized yet, causing ReferenceError.
- **Fix**: Replaced standalone `vi.fn()` declarations with `vi.hoisted()` blocks in both test files.
- **Files modified**: tests/integration/generate_image_style.test.ts, tests/integration/generate_batch.test.ts
- **Commit**: 2ddcd3c

## Known Stubs

None.

## Threat Flags

None — no new network endpoints or trust boundaries introduced. reference_image path is echoed to the caller who supplied it (T-15-01 accepted). Path traversal protection delegated to assertWithinInputRoot() in edit_prompt capability (T-15-02 mitigated).

## Self-Check: PASSED

- src/index.ts modified: FOUND
- src/batch.ts modified: FOUND
- tests/integration/generate_image_style.test.ts created: FOUND
- tests/integration/generate_batch.test.ts modified: FOUND
- Commit f30377e: FOUND
- Commit edf09e0: FOUND
- Commit 2ddcd3c: FOUND
- npm test: 339/339 passed
