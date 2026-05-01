---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Goal-Shaped Image MCP
status: executing
stopped_at: "Phase 5 complete: capability registry, image_op, extract_subject, edit_prompt, code review, security audit, verification, and human UAT passed."
last_updated: "2026-05-01T22:30:00Z"
last_activity: 2026-05-01 -- Phase 5 complete; Phase 6 ready to plan
progress:
  total_phases: 11
  completed_phases: 4
  total_plans: 11
  completed_plans: 9
  percent: 82
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-01)

**Core value:** Two value props — guaranteed primitives (v1.0) and flexible goal handoff (v2.0).
**Current focus:** Phase 6 — Run/Session Artifact Layer.

## Current Position

Phase: Phase 5 complete — Phase 6 next
Plan: —
Status: Ready to plan Phase 6
Last activity: 2026-05-01 -- Phase 5 complete; human UAT passed

## Performance Metrics

**Velocity:**

- Total plans completed: 9
- Average duration: 2 min
- Total execution time: 0.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-core-enhancements | 2/2 | 4 min | 2 min |
| 02-post-processing | 2/2 | 3 min | 1.5 min |
| 03-asset-pipeline | 2/2 | 2 min | 1 min |
| 05-capability-layer-image-op-first-2-caps | 3/3 | 9 min | 3 min |

**Recent Trend:**

- Last 5 plans: 03-01 (1 min), 03-02 (1 min), 05-01 (4 min), 05-02 (3 min), 05-03 (2 min)
- Trend: Phase 5 executed successfully with extra UAT fix cycles after the planned tasks
- Note: Phase 6 introduces persistent run artifacts and retention behavior, which will become the substrate for Phase 7 evals

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
- Phase 5 uses OpenAI `gpt-image-1.5` by default for `edit_prompt` via `OPENAI_EDIT_MODEL`; unresolved MCP `${...}` placeholders are treated as unset before defaults apply
- `@imgly/local` provider names are sanitized before filename generation so slashes cannot create nested output paths

**v1.0 decisions (still in force):**

- sharp for image processing (no ImageMagick dependency)
- PNG-only output (transparency for circle masks and intermediate alpha)
- Buffer-in/Buffer-out processing pattern (composability)
- Tagged union for ProcessingOperation (type-safe dispatch)
- Path priority: outputPath > outputDir > IMAGE_GEN_OUTPUT_DIR > ~/Downloads/generated-images
- Atomic writes (tmp + rename) for files

### Pending Todos

- Plan Phase 6 via `/gsd-plan-phase 6`
- Add new deps before later execution: `pixelmatch` (P7), `tesseract.js` (P8), `@anthropic-ai/sdk` (P9)
- New env var documentation still needed: `ANTHROPIC_API_KEY` (P9), `IMAGE_GEN_RUN_RETENTION_HOURS` (P6)

### Blockers/Concerns

- None currently. Phase 7 (eval) is on the critical path before Phase 11 (provider breadth) — second-provider-per-op requires measured eval score before shipping.

## Session Continuity

Last session: 2026-05-01
Stopped at: Phase 5 complete with review, security, verification, and human UAT passed.
Resume file: .planning/ROADMAP.md (Phase 6 details)

## Quick Tasks

- 2026-04-24 — 260424-h6z — Added `npm run check-models` inventory script (scripts/check-models.ts + README section). Detected drift: xAI default `grok-2-image` no longer in listing (now `grok-imagine-image` / `-pro`); Gemini 3 preview variants available.
- 2026-04-24 — 260424-heb — Bumped Grok provider default from `grok-2-image` to `grok-imagine-image` in lockstep across `src/providers/grok.ts`, `KNOWN_DEFAULTS` mirror in `scripts/check-models.ts`, and both README model tables. Retained `grok-2-image` as callable override. Replaced incorrect `grok-imagine` shorthand with real xAI API IDs. Build passes. No behavior change to `generate()`.
