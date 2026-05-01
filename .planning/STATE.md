---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Goal-Shaped Image MCP
status: executing
stopped_at: "v2.0 roadmap drafted with 7 phases (5-11). v1.0 Phase 4 marked superseded by v2.0 P5. Coverage validated: 46/46 v2.0 requirements mapped, no orphans."
last_updated: "2026-05-01T20:33:55.343Z"
last_activity: 2026-05-01 -- Phase 5 planning complete
progress:
  total_phases: 11
  completed_phases: 3
  total_plans: 11
  completed_plans: 6
  percent: 55
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-01)

**Core value:** Two value props — guaranteed primitives (v1.0) and flexible goal handoff (v2.0).
**Current focus:** v2.0 roadmap defined (Phases 5-11). Ready to plan Phase 5 (Capability Layer + image_op + first 2 caps).

## Current Position

Phase: Not started — Phase 5 next
Plan: —
Status: Ready to execute
Last activity: 2026-05-01 -- Phase 5 planning complete

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
- Note: v2.0 phases are larger surface (planner, eval harness, capability registry) — expect longer per-plan durations

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

**v2.0 architectural locks (from master plan):**

- CapabilityRegistry parallel to ImageProvider (NOT optional methods on ImageProvider) — five existing providers untouched
- Drop ProviderName enum at capability layer; use plain string so adding providers doesn't break the type union
- Anthropic Claude Haiku as planner LLM ($0.001-0.003/call)
- Templates seed from ASSET_PRESETS by reference (not forked) — fixes propagate to v1.0 generate_asset
- Trace returns paths only, never base64 (MCP stdio response size bound)
- Eval harness blocks second provider per op without measured score
- generate_asset is NOT deprecated — kept as guaranteed/cheap/deterministic alternative to image_task

**v1.0 decisions (still in force):**

- sharp for image processing (no ImageMagick dependency)
- PNG-only output (transparency for circle masks and intermediate alpha)
- Buffer-in/Buffer-out processing pattern (composability)
- Tagged union for ProcessingOperation (type-safe dispatch)
- Path priority: outputPath > outputDir > IMAGE_GEN_OUTPUT_DIR > ~/Downloads/generated-images
- Atomic writes (tmp + rename) for files

### Pending Todos

- Plan Phase 5 via `/gsd-plan-phase 5`
- Add new deps before P5 execution: `@imgly/background-removal-node` (P5), `pixelmatch` (P7), `tesseract.js` (P8), `@anthropic-ai/sdk` (P9)
- New env var documentation: `ANTHROPIC_API_KEY` (P9), `IMAGE_GEN_RUN_RETENTION_HOURS` (P6)

### Blockers/Concerns

- None currently. Phase 7 (eval) is on the critical path before Phase 11 (provider breadth) — second-provider-per-op requires measured eval score before shipping.

## Session Continuity

Last session: 2026-05-01
Stopped at: v2.0 roadmap drafted with 7 phases (5-11). v1.0 Phase 4 marked superseded by v2.0 P5. Coverage validated: 46/46 v2.0 requirements mapped, no orphans.
Resume file: .planning/ROADMAP.md (Phase 5 details)

## Quick Tasks

- 2026-04-24 — 260424-h6z — Added `npm run check-models` inventory script (scripts/check-models.ts + README section). Detected drift: xAI default `grok-2-image` no longer in listing (now `grok-imagine-image` / `-pro`); Gemini 3 preview variants available.
- 2026-04-24 — 260424-heb — Bumped Grok provider default from `grok-2-image` to `grok-imagine-image` in lockstep across `src/providers/grok.ts`, `KNOWN_DEFAULTS` mirror in `scripts/check-models.ts`, and both README model tables. Retained `grok-2-image` as callable override. Replaced incorrect `grok-imagine` shorthand with real xAI API IDs. Build passes. No behavior change to `generate()`.
