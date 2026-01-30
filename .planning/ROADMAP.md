# Roadmap: Image-Gen MCP v2 - Asset Pipeline

## Overview

Transform the existing image generation MCP server into a complete asset pipeline — from generation through post-processing — delivering ready-to-use image assets in a single call. Four phases enhance core capabilities, add processing operations, build high-level asset tools, and enable character consistency through reference images.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Core Enhancements** - Enhanced generation with output control, style modifiers, and size-aware provider selection
- [ ] **Phase 2: Post-Processing** - Image processing operations (resize, crop, aspect crop, circle mask)
- [ ] **Phase 3: Asset Pipeline** - High-level asset generation with presets
- [ ] **Phase 4: Reference Images** - Character consistency through reference image support

## Phase Details

### Phase 1: Core Enhancements
**Goal**: Users can control output paths, apply style modifiers, and benefit from size-aware provider selection
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-07, CORE-08
**Success Criteria** (what must be TRUE):
  1. User can specify exact output file path via `outputPath` parameter and image saves to that location
  2. User can specify output directory via `outputDir` parameter and filename auto-generates following date/provider/hash pattern
  3. When user specifies size (landscape/portrait) and default provider doesn't support it, system selects a size-capable provider automatically
  4. Response shows which provider was actually used (supports debugging when size-based selection changes the provider)
  5. User can pass `style` parameter and it modifies the generation prompt appropriately
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Output path control, default provider change to grok, startup logs
- [ ] 01-02-PLAN.md — Style parameter, size-aware provider selection, enhanced error responses

### Phase 2: Post-Processing
**Goal**: Users can transform generated images through resize, crop, aspect crop, and circle mask operations
**Depends on**: Phase 1
**Requirements**: PROC-01, PROC-02, PROC-03, PROC-04, PROC-05, PROC-06
**Success Criteria** (what must be TRUE):
  1. User can resize an image to specified dimensions with fit modes (cover, contain, fill)
  2. User can crop an image using x/y/w/h coordinates
  3. User can aspect-crop an image to standard ratios (1:1, 16:9, 9:16, 4:3, 3:4) with gravity control
  4. User can apply circle mask to produce circular image with transparent background
  5. User can chain multiple operations in one call (e.g., aspect-crop then circle mask then resize) and they execute in order
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Asset Pipeline
**Goal**: Users can generate ready-to-use assets (profile pics, post images, hero photos, avatars, scenes) in one call
**Depends on**: Phase 2
**Requirements**: ASSET-01, ASSET-02, ASSET-03, ASSET-04, ASSET-05, ASSET-06, ASSET-07
**Success Criteria** (what must be TRUE):
  1. User can call `generate_asset` with `assetType: "profile_pic"` and receive a 200x200 circular PNG in one operation
  2. User can call `generate_asset` with `assetType: "post_image"` and receive a 1200x675 16:9 landscape PNG in one operation
  3. User can call `generate_asset` with `assetType: "hero_photo"` and receive a 1080x1920 9:16 portrait PNG in one operation
  4. User can call `generate_asset` with `assetType: "avatar"` and receive an 80x80 circular PNG in one operation
  5. User can call `generate_asset` with `assetType: "scene"` and receive a 1200x675 16:9 landscape PNG in one operation
  6. Asset ID-based outputs produce clean filenames (no date/hash prefix) for predictable paths
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: Reference Images
**Goal**: Users can generate consistent character images across multiple outputs using reference images
**Depends on**: Phase 3
**Requirements**: REF-01, REF-02, REF-03, REF-04, REF-05, REF-06, REF-07
**Success Criteria** (what must be TRUE):
  1. User can pass `referenceImage` path when generating and the output shows recognizable similarity to the reference
  2. User can control similarity strength via `referenceWeight` parameter (0.0-1.0)
  3. OpenAI provider generates images using reference via edit API
  4. Gemini provider generates images using reference via multi-modal input
  5. Provider fallback chain is context-dependent: uses only reference-capable providers when reference provided, uses all providers when no reference
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Enhancements | 0/2 | Planned | - |
| 2. Post-Processing | 0/TBD | Not started | - |
| 3. Asset Pipeline | 0/TBD | Not started | - |
| 4. Reference Images | 0/TBD | Not started | - |
