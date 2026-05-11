---
phase: 14-batch-generation
plan: "01"
subsystem: batch-generation
tags: [batch, concurrency, manifest, tool-registration, integration-tests]
dependency_graph:
  requires: []
  provides: [generate_batch-tool, RunManifest-partial-status, runWithConcurrency]
  affects: [src/runs/manifest.ts, src/index.ts]
tech_stack:
  added: [src/batch.ts, src/provider-utils.ts]
  patterns: [chunked-Promise.allSettled, per-item-failure-isolation, vi.mock-for-module-mocking]
key_files:
  created:
    - src/batch.ts
    - src/provider-utils.ts
    - tests/integration/generate_batch.test.ts
  modified:
    - src/runs/manifest.ts
    - src/index.ts
decisions:
  - "Extracted resolveProvider/buildEffectivePrompt to src/provider-utils.ts to avoid circular import (index.ts → batch.ts → index.ts)"
  - "resolveProvider signature takes explicit defaultProvider parameter rather than module-level constant to support testability"
  - "Used vi.mock on provider-utils.js in tests for clean provider isolation without real API keys"
  - "Manifest .runs/ root is placed under IMAGE_GEN_OUTPUT_DIR — tests use tmp.dir/.runs/ not process.cwd()/.runs/"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-11"
  tasks_completed: 4
  files_changed: 5
---

# Phase 14 Plan 01: Batch Generation Implementation Summary

**One-liner:** Chunked-concurrency batch image generation with per-item failure isolation, 'partial' manifest status, and 10-case integration test suite.

## Status

complete — 4/4 tasks completed, 328/328 tests passing.

## Changes

### Files Created
- `src/batch.ts` — `handleGenerateBatch()` and `runWithConcurrency()` exports; chunked Promise.allSettled concurrency; per-item try/catch failure isolation; manifest written in_progress → terminal (success/partial/error)
- `src/provider-utils.ts` — shared `resolveProvider()`, `buildEffectivePrompt()`, `resolveDefaultProvider()` extracted from index.ts to break circular import
- `tests/integration/generate_batch.test.ts` — 10 integration tests: all-success, partial failure, all-fail, invalid provider, style propagation, outputDir passthrough, max_concurrent enforcement (in-flight counter), manifest file existence, empty items validation, provider param applied to all items

### Files Modified
- `src/runs/manifest.ts` — additive type extensions: `'partial'` added to `status` union, `'generate_batch'` added to `invocation.tool` union, optional `batchItems` field on `invocation`
- `src/index.ts` — imports from `provider-utils.js` (replaces local definitions), imports `handleGenerateBatch` from `batch.js`, registers `generate_batch` tool with full schema before `image_op` registration

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Circular import prevention via provider-utils.ts extraction**
- **Found during:** Task 2 design analysis (pre-emptive, before writing code)
- **Issue:** Plan noted that `resolveProvider` and `buildEffectivePrompt` in `src/index.ts` were not exported. Adding `export` and importing from `batch.ts` would create a circular dependency: `index.ts` → `batch.ts` → `index.ts`
- **Fix:** Created `src/provider-utils.ts` as a shared module. Updated `src/index.ts` to import from `provider-utils.ts` (removing local definitions). Both `index.ts` and `batch.ts` import from `provider-utils.ts` with no cycle.
- **Files modified:** `src/provider-utils.ts` (created), `src/index.ts` (updated imports + call sites)
- **Impact:** `resolveProvider` signature now requires explicit `defaultProvider` parameter (was using module-level `DEFAULT_PROVIDER` constant). All 3 call sites in `index.ts` updated to pass `DEFAULT_PROVIDER`.

**2. [Rule 1 - Bug] Manifest path in test was using process.cwd()/.runs/ instead of IMAGE_GEN_OUTPUT_DIR/.runs/**
- **Found during:** Task 4 execution (test failure)
- **Issue:** The manifest existence test used `path.join(process.cwd(), '.runs')` but `resolveRunDir` places `.runs` under `IMAGE_GEN_OUTPUT_DIR` (via `getOutputDir()`). In tests, `withTmpOutputDir` sets `IMAGE_GEN_OUTPUT_DIR` to a temp dir, so runs go to `tmp.dir/.runs/`, not `cwd/.runs/`.
- **Fix:** Changed test to use `path.join(tmp.dir, '.runs')` as the runs root.
- **Files modified:** `tests/integration/generate_batch.test.ts`

## Known Stubs

None.

## Threat Flags

None — no new network endpoints or auth paths beyond what is in the plan's threat model. `resolveOutputPath` enforces existing `IMAGE_GEN_INPUT_ROOT` guard on all item output paths.

## Self-Check: PASSED

Files exist:
- src/batch.ts: FOUND
- src/provider-utils.ts: FOUND
- src/runs/manifest.ts: FOUND (with 'partial' and 'generate_batch')
- src/index.ts: FOUND (with generate_batch tool registration)
- tests/integration/generate_batch.test.ts: FOUND

Commits exist:
- 327eb9b: feat(14-01): extend RunManifest types
- 560968d: feat(14-01): create src/batch.ts
- 2f9ec62: feat(14-01): register generate_batch tool
- 6ef6664: test(14-01): add integration tests

Build: 0 TypeScript errors
Tests: 328/328 passing (50 test files)
