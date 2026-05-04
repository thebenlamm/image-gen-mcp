---
phase: 03-asset-pipeline
plan: 01
subsystem: asset-management
completed: 2026-01-30
duration: 1min
tags:
  - presets
  - asset-types
  - filename-generation
requires:
  - 02-01-PLAN.md (processing operations used in preset definitions)
provides:
  - Asset preset definitions for 5 asset types
  - Clean filename resolution for asset IDs
affects:
  - 03-02-PLAN.md (generate_asset tool will use presets)
tech-stack:
  added: []
  patterns:
    - Asset type presets with generation sizes and processing pipelines
    - Clean filename generation for predictable outputs
decisions:
  - id: preset-circle-mask-order
    choice: Apply circleMask before resize for profile_pic and avatar
    rationale: Masking at higher resolution produces smoother edges after downscaling
  - id: filename-priority
    choice: Priority order - outputPath > outputDir+assetId > outputDir > default+assetId > default
    rationale: Explicit paths always win, then assetId enables clean names, fallback to generated names
key-files:
  created:
    - src/utils/presets.ts (Asset preset definitions and lookup)
  modified:
    - src/utils/image.ts (Added assetId support to resolveOutputPath)
---

# Phase 03 Plan 01: Asset Preset Definitions & Clean Filenames Summary

**One-liner:** Define asset presets (profile_pic, post_image, hero_photo, avatar, scene) with generation parameters and processing pipelines, add clean filename support for asset IDs.

## What Was Built

### Asset Preset System
Created `src/utils/presets.ts` with:
- **AssetType** union type for 5 asset categories
- **AssetPreset** interface defining generation size and processing operations
- **ASSET_PRESETS** record with all preset configurations:
  - `profile_pic`: square generation → 1:1 crop → circle mask → resize 200x200
  - `post_image`: landscape generation → 16:9 crop → resize 1200x675
  - `hero_photo`: portrait generation → 9:16 crop → resize 1080x1920
  - `avatar`: square generation → 1:1 crop → circle mask → resize 80x80
  - `scene`: landscape generation → 16:9 crop → resize 1200x675
- **getPreset()** lookup function

### Clean Filename Support
Enhanced `src/utils/image.ts` with:
- Added `assetId?: string` field to `OutputOptions`
- Updated `resolveOutputPath()` to generate clean filenames when assetId provided
- Priority order: explicit path > dir+assetId > dir+generated > default+assetId > default+generated
- Produces `{assetId}.png` instead of `2026-01-30-grok-{slug}-{hash}.png`

## Technical Details

### Circle Mask Order Optimization
For `profile_pic` and `avatar`, the operation order is critical:
1. **aspectCrop 1:1** - ensure square input
2. **circleMask** - apply circular mask at high resolution
3. **resize** - downscale to target size

This order produces smoother edges than masking after resize because anti-aliasing happens at higher resolution.

### Filename Generation Logic
The `resolveOutputPath()` function now handles 5 cases:
1. `outputPath` provided → use exact path (unchanged)
2. `outputDir` + `assetId` → `{outputDir}/{assetId}.png`
3. `outputDir` only → `{outputDir}/{generated}.png`
4. `assetId` only → `{defaultDir}/{assetId}.png`
5. Neither → `{defaultDir}/{generated}.png`

Existing behavior fully preserved when `assetId` is not provided.

## Files Modified

### Created
- **src/utils/presets.ts** (64 lines)
  - Asset type definitions
  - Preset configurations
  - Lookup function

### Modified
- **src/utils/image.ts** (+19 lines)
  - Added `assetId` field to `OutputOptions`
  - Expanded `resolveOutputPath()` with clean filename logic

## Decisions Made

**1. Circle mask before resize**
- **Decision:** Apply circleMask operation before resize for profile_pic and avatar
- **Rationale:** Masking at higher resolution (e.g., 1024x1024) then resizing down produces smoother anti-aliased edges than masking at target size (200x200 or 80x80)
- **Impact:** Better visual quality for circular avatars and profile pictures

**2. Filename priority order**
- **Decision:** Priority: outputPath > outputDir+assetId > outputDir > default+assetId > default
- **Rationale:** Explicit paths always win, assetId enables clean predictable names when desired, fallback to generated names for backward compatibility
- **Impact:** Users can get clean filenames without sacrificing flexibility of explicit paths or generated names

## Next Phase Readiness

**Blockers:** None

**Concerns:** None

**Dependencies satisfied:**
- ✅ ProcessingOperation type from 02-01 (processing.ts)
- ✅ resolveOutputPath infrastructure from 01-01 (image.ts)

**Ready for 03-02:**
The `generate_asset` tool can now:
- Look up presets with `getPreset(assetType)`
- Use `generationSize` to pass appropriate size hint to providers
- Apply `operations` array to `applyOperations()` from 02-01
- Use `assetId` parameter with `resolveOutputPath()` for clean filenames

## Deviations from Plan

None - plan executed exactly as written.

## Testing Notes

**Verification:**
- ✅ TypeScript compilation passes
- ✅ src/utils/presets.ts exists with all exports
- ✅ src/utils/image.ts has assetId support in OutputOptions and resolveOutputPath

**Manual testing needed (03-02):**
- Generate profile_pic and verify circle mask quality
- Generate with assetId and verify clean filename
- Generate without assetId and verify generated filename still works

## Metrics

- **Tasks completed:** 2/2
- **Files created:** 1
- **Files modified:** 1
- **Duration:** 1 minute
- **Commits:** 2 (atomic per task)
