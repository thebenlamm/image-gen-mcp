---
phase: 13-mockup-workflow
plan: "01"
subsystem: task/templates
tags: [template, brand-mockup, generate, composite_layers, image_task]
dependency_graph:
  requires: [generate:openai capability, composite_layers:sharp capability]
  provides: [brand-mockup template builder, brand_mockup template builder]
  affects: [src/task/templates.ts, TEMPLATE_BUILDERS registry]
tech_stack:
  added: []
  patterns: [two-node DAG template, negative prompt suffix, firstInputRef SVG overlay]
key_files:
  modified:
    - src/task/templates.ts
    - tests/task/templates.test.ts
decisions:
  - "outputKind uses 'image' for both nodes (plan-schema.ts enum is 'image' | 'data', not 'text' | 'json')"
  - "brandMockup added after upscaleExport, registered under both 'brand-mockup' and 'brand_mockup'"
  - "Canvas 1024x1024 square default; landscape=1792x1024, portrait=1024x1792"
  - "Negative typography suffix hardcoded after goal string — caller cannot remove it"
metrics:
  duration: "104s"
  completed: "2026-05-11"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 13 Plan 01: brand-mockup Template Builder Summary

**One-liner:** Two-node generate→composite template producing photorealistic product scenes with hardcoded negative typography suffix and SVG wordmark overlay via sharp.

## Status: Complete

**Tasks completed:** 2/2

## Changes

### Modified Files

- `src/task/templates.ts` — Added `brandMockup` TemplateBuilder (61 lines) and registered both `'brand-mockup'` and `'brand_mockup'` keys in `TEMPLATE_BUILDERS`
- `tests/task/templates.test.ts` — Added `makeRegistryWithGenerate()` helper and `describe('brand-mockup template', ...)` block with 10 test cases

## Implementation Notes

### Template Structure

The `brandMockup` builder produces a two-node DAG:

1. **scene** (`generate:openai`) — prompt is `${input.goal}, photorealistic product scene, clean surfaces, no text, no labels, no typography, no words, no lettering`; the five negative terms are hardcoded after the caller's goal string and cannot be removed via goal manipulation
2. **composite** (`composite_layers:sharp`) — base layer is `$nodes.scene.output`, overlay layer is `$inputs.image_0` (from `firstInputRef()`), anchored `bottom-left` at x=40, y=canvas.height-40, scale=0.3

### Canvas Sizing

| `output_size` | Width | Height |
|---------------|-------|--------|
| square (default) | 1024 | 1024 |
| landscape | 1792 | 1024 |
| portrait | 1024 | 1792 |

When `output_size` is `landscape` or `portrait`, `generateParams.size` is also set so the OpenAI provider produces the correct aspect ratio.

### Key Decisions

- `outputKind: 'image'` for both nodes — `plan-schema.ts` uses `z.enum(['image', 'data'])`, not `'text'` or `'json'` as suggested in the plan's interface comment
- `estimatedTotalCostUsd: 0.04` and `estimatedTotalLatencyMs: 12400` are always set (required by `PlanSchema` — both are non-optional in the Zod schema)
- `matchTemplate()` already performs the capability guard (`registry.get(node.op, node.provider)`) and `PlanSchema.safeParse` for all registered templates — no extra guard needed in `brandMockup` itself

### Threat Model Compliance

- **T-13-01 (Tampering):** Negative typography suffix is hardcoded in the template string — caller goal string is prepended, suffix cannot be removed by caller input. Mitigated as required.
- **T-13-02 (Information Disclosure):** SVG path resolved at execution time by existing dag-executor path guard. Accepted as per plan.

## Test Results

All 10 new brand-mockup tests pass. Full suite: 318 tests across 49 files — all passing, no regressions.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 8168092 | feat(13-01): add brandMockup template builder to templates.ts |
| 2 | 45183d1 | test(13-01): add brand-mockup unit tests to templates.test.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/task/templates.ts` exists and contains `'brand-mockup': brandMockup` ✓
- `tests/task/templates.test.ts` exists and contains `brand-mockup` test block ✓
- Commit `8168092` exists ✓
- Commit `45183d1` exists ✓
- `npm run build` clean ✓
- `npm test` 318/318 pass ✓
