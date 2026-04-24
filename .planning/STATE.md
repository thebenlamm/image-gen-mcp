# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-29)

**Core value:** One MCP call produces a ready-to-use image asset — generated, processed, and saved — without manual post-processing steps.
**Current focus:** Phase 3 complete, ready for Phase 4

## Current Position

Phase: 3 of 4 complete, ready for Phase 4
Plan: All Phase 3 plans complete (2/2)
Status: Phase 3 verified and complete
Last activity: 2026-01-30 — Phase 3 verified (6/6 must-haves), ready for Phase 4

Progress: [███████░░░] 75% (3/4 phases)

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 1.5 min
- Total execution time: 0.15 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-core-enhancements | 2/2 | 4 min | 2 min |
| 02-post-processing | 2/2 | 3 min | 1.5 min |
| 03-asset-pipeline | 2/2 | 2 min | 1 min |

**Recent Trend:**
- Last 5 plans: 02-01 (2 min), 02-02 (1 min), 03-01 (1 min), 03-02 (1 min)
- Trend: Accelerating — Phase 3 completed efficiently at 1 min/plan

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Grok as default provider (best quality for Ben's use cases) -- implemented in 01-01
- sharp for image processing (standard Node.js library, no ImageMagick dependency)
- Fallback chain in utility, not providers (keeps providers testable, fallback logic centralized)
- PNG-only output (transparency needed for circle masks)
- resolveOutputPath as additive function (existing getOutputDir/generateFilename still exported)
- Path priority: outputPath > outputDir > IMAGE_GEN_OUTPUT_DIR > ~/Downloads/generated-images
- Style applied at tool level via prompt prepend, not passed to providers -- implemented in 01-02
- Size-aware selection is a targeted capability filter, not a general fallback chain -- implemented in 01-02
- Capability flags pattern on ImageProvider interface for feature detection -- established in 01-02
- Buffer-in-Buffer-out pattern for composability and testability -- established in 02-01
- Tagged union type for type-safe operation dispatch -- established in 02-01
- Default fit mode 'cover' for resize, default gravity 'center' for aspectCrop -- established in 02-01
- Default output path uses _processed suffix when outputPath not specified -- established in 02-02
- PNG-only output enforced at tool level -- established in 02-02
- Error handling follows generate_image pattern for consistency -- established in 02-02
- Circle mask before resize for smoother edges -- established in 03-01
- Clean filename priority: outputPath > outputDir+assetId > outputDir > default+assetId > default -- established in 03-01
- generate_asset orchestrates full pipeline (generate → process → save) -- established in 03-02
- Size-aware selection applies at generation time with preset size -- established in 03-02

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-04-24
Stopped at: Quick task 260424-h6z complete (check-models inventory script). Phase 3 verified; Phase 4 still pending planning.
Resume file: None

## Quick Tasks

- 2026-04-24 — 260424-h6z — Added `npm run check-models` inventory script (scripts/check-models.ts + README section). Detected drift: xAI default `grok-2-image` no longer in listing (now `grok-imagine-image` / `-pro`); Gemini 3 preview variants available.
