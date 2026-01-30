---
phase: 03-asset-pipeline
plan: 02
subsystem: mcp-tools
tags: [tool-registration, orchestration, asset-pipeline]
requires: [03-01]
provides: [generate_asset-tool]
affects: [Phase 4]
tech-stack:
  added: []
  patterns: [tool-orchestration, preset-driven-processing]
key-files:
  created: []
  modified: [src/index.ts]
decisions:
  - generate_asset orchestrates full pipeline (generate → process → save)
  - assetId flows to resolveOutputPath for clean filenames
  - Size-aware selection applies at generation time with preset size
metrics:
  duration: 1 min
  completed: 2026-01-30
---

# Phase 03 Plan 02: Asset Pipeline Tool Summary

**One-liner:** Register generate_asset tool combining generation and post-processing into single MCP call with 5 asset type presets.

## What Was Built

Registered the `generate_asset` MCP tool in `src/index.ts` that combines image generation and post-processing into a unified operation:

1. **Tool registration** — Added `generate_asset` tool with schema for all 5 asset types (profile_pic, post_image, hero_photo, avatar, scene)
2. **Orchestration logic** — Implemented pipeline: preset lookup → provider selection → image generation → post-processing → path resolution → save
3. **assetId support** — Passed through to `resolveOutputPath` for clean filenames (e.g., "my-avatar" produces my-avatar.png)
4. **Response format** — Returns comprehensive success/error responses following established patterns with assetType, outputSize, operationsApplied
5. **Startup logging** — Added asset types to server startup output

## Key Implementation Details

**Tool schema:**
- `prompt` (required) — Image description
- `assetType` (required enum) — 5 preset types
- `provider`, `model`, `style` (optional) — Generation controls
- `assetId`, `outputPath`, `outputDir` (optional) — Path resolution options

**Orchestration flow:**
1. Look up preset via `getPreset(assetType)`
2. Resolve provider (with size-aware selection using preset.generationSize)
3. Generate image with preset's generation size
4. Apply post-processing operations via `applyOperations(buffer, preset.operations)`
5. Resolve output path with assetId support
6. Save processed image
7. Return comprehensive response

**Integration points:**
- `src/utils/presets.ts` — Preset definitions and lookup
- `src/utils/processing.ts` — `applyOperations` for post-processing
- `src/utils/image.ts` — `resolveOutputPath` with assetId support, `saveImage`
- `src/providers/index.ts` — Registry for provider selection

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| a586764 | feat | Register generate_asset MCP tool with full orchestration |

## Deviations from Plan

None — plan executed exactly as written.

## Testing & Verification

All verification criteria met:

- ✅ `npm run build` succeeds
- ✅ `generate_asset` tool registered in src/index.ts
- ✅ All five asset types available in schema enum
- ✅ Handler orchestrates: generate → process → save in single call
- ✅ assetId flows through to resolveOutputPath for clean filenames

## Technical Decisions

**1. Size-aware selection at generation time**
- Applied size-aware provider selection using preset.generationSize
- Ensures provider supports the aspect ratio needed by the asset type
- Pattern established in 01-02, reused here with preset-driven sizing

**2. Response includes comprehensive metadata**
- assetType: Which preset was used
- outputSize: Final dimensions after processing
- operationsApplied: List of operations executed
- Enables users to verify correct asset type produced

**3. Error handling follows generate_image pattern**
- Includes assetType in error responses
- Maintains consistency across MCP tools
- Helps debugging by identifying which asset type failed

## Impact

**User experience:**
- Single tool call produces ready-to-use assets
- No need to manually call generate_image → process_image
- Clean filenames via assetId parameter

**For future work:**
- Phase 4 can add new asset types by extending ASSET_PRESETS
- Tool is preset-driven, making it easy to add new configurations
- Orchestration pattern established for complex multi-step operations

## Next Phase Readiness

**Blockers:** None

**Readiness:** Phase 3 complete. All asset pipeline infrastructure in place:
- Preset system (03-01)
- Unified tool (03-02)
- Ready for Phase 4: Documentation and Examples

**Concerns:** None
