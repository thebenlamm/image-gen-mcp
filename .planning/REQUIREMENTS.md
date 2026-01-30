# Requirements: Image-Gen MCP v2

**Defined:** 2026-01-29
**Core Value:** One MCP call produces a ready-to-use image asset — generated, processed, and saved — without manual post-processing steps.

## v1 Requirements

### Core Enhancements

- [x] **CORE-01**: User can specify exact output file path via `outputPath` parameter
- [x] **CORE-02**: User can specify output directory via `outputDir` parameter (auto-generates filename)
- [x] **CORE-03**: Default provider changes from openai to grok
- [ ] **CORE-04**: ~~Provider fallback chain tries next provider when current fails (rate limit, API error, content policy)~~ *Deferred from Phase 1*
- [ ] **CORE-05**: ~~Fallback chain order is configurable via `IMAGE_GEN_PROVIDER_ORDER` env var~~ *Deferred from Phase 1*
- [ ] **CORE-06**: ~~Response includes `fallbackUsed` and `originalProvider` fields~~ *Deferred from Phase 1*
- [x] **CORE-07**: User can pass `style` parameter that modifies generation prompt
- [x] **CORE-08**: Startup logs show available providers, default provider, and size-capable providers

### Post-Processing

- [x] **PROC-01**: User can resize an image to specified width/height with fit modes (cover, contain, fill)
- [x] **PROC-02**: User can crop an image with x/y/w/h coordinates
- [x] **PROC-03**: User can aspect-crop an image to standard ratios (1:1, 16:9, 9:16, 4:3, 3:4) with gravity
- [x] **PROC-04**: User can apply circle mask to an image (transparent background)
- [x] **PROC-05**: Operations are composable — multiple operations chain in order via `process_image` tool
- [x] **PROC-06**: Response includes original size, output size, and operations applied

### Asset Pipeline

- [ ] **ASSET-01**: `generate_asset` tool combines generation + post-processing in one call
- [ ] **ASSET-02**: `profile_pic` preset: square generation, 1:1 crop, circle mask, resize 200x200
- [ ] **ASSET-03**: `post_image` preset: landscape generation, 16:9 crop, resize 1200x675
- [ ] **ASSET-04**: `hero_photo` preset: portrait generation, 9:16 crop, resize 1080x1920
- [ ] **ASSET-05**: `avatar` preset: square generation, 1:1 crop, circle mask, resize 80x80
- [ ] **ASSET-06**: `scene` preset: landscape generation, 16:9 crop, resize 1200x675
- [ ] **ASSET-07**: Asset ID-based output produces clean filenames (no date/hash prefix)

### Reference Images

- [ ] **REF-01**: User can pass `referenceImage` path to generation for character consistency
- [ ] **REF-02**: User can pass `referenceWeight` (0.0–1.0) to control similarity to reference
- [ ] **REF-03**: OpenAI provider supports reference images via edit API
- [ ] **REF-04**: Gemini provider supports reference images via multi-modal input
- [ ] **REF-05**: Provider interface includes `supportsReference` flag
- [ ] **REF-06**: Fallback chain is context-dependent: reference-capable providers only when reference provided
- [ ] **REF-07**: Reference provider order configurable via `IMAGE_GEN_REFERENCE_PROVIDER_ORDER` env var

## v2 Requirements

### Batch Operations

- **BATCH-01**: `generate_batch` tool generates multiple images in one call
- **BATCH-02**: Batch runs sequentially with early-fail-continue semantics
- **BATCH-03**: Manifest JSON tracks prompt, provider, asset type, success/failure per asset
- **BATCH-04**: Failed assets don't stop remaining assets from generating

## Out of Scope

| Feature | Reason |
|---------|--------|
| Image editing via inpainting | Different tool, different complexity |
| Video/animation | Still images only |
| Cloud storage (S3, CDN) | Local disk only, personal tool |
| User-facing UI | MCP server consumed by Claude Code only |
| Caching/deduplication | Same prompt generates new image every time |
| Cost tracking | Check provider dashboards directly |
| NSFW filtering | Rely on provider-side content policies |
| JPEG/WebP output | PNG only — transparency needed for circle masks |
| Replicate reference support | Model-dependent, defer to later |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 1 | Complete |
| CORE-02 | Phase 1 | Complete |
| CORE-03 | Phase 1 | Complete |
| CORE-04 | Deferred | Deferred from Phase 1 |
| CORE-05 | Deferred | Deferred from Phase 1 |
| CORE-06 | Deferred | Deferred from Phase 1 |
| CORE-07 | Phase 1 | Complete |
| CORE-08 | Phase 1 | Complete |
| PROC-01 | Phase 2 | Complete |
| PROC-02 | Phase 2 | Complete |
| PROC-03 | Phase 2 | Complete |
| PROC-04 | Phase 2 | Complete |
| PROC-05 | Phase 2 | Complete |
| PROC-06 | Phase 2 | Complete |
| ASSET-01 | Phase 3 | Pending |
| ASSET-02 | Phase 3 | Pending |
| ASSET-03 | Phase 3 | Pending |
| ASSET-04 | Phase 3 | Pending |
| ASSET-05 | Phase 3 | Pending |
| ASSET-06 | Phase 3 | Pending |
| ASSET-07 | Phase 3 | Pending |
| REF-01 | Phase 4 | Pending |
| REF-02 | Phase 4 | Pending |
| REF-03 | Phase 4 | Pending |
| REF-04 | Phase 4 | Pending |
| REF-05 | Phase 4 | Pending |
| REF-06 | Phase 4 | Pending |
| REF-07 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 25
- Deferred: 3 (CORE-04, CORE-05, CORE-06)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-29*
*Last updated: 2026-01-30 after Phase 2 completion*
