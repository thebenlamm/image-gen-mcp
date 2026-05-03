---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Goal-Shaped Image MCP
status: executing
stopped_at: Completed 09-02-PLAN.md
last_updated: "2026-05-03T16:13:27.967Z"
last_activity: 2026-05-03
progress:
  total_phases: 11
  completed_phases: 7
  total_plans: 21
  completed_plans: 18
  percent: 86
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-01)

**Core value:** Two value props — guaranteed primitives (v1.0) and flexible goal handoff (v2.0).
**Current focus:** Phase 09 — image-task-planner-dag-executor

## Current Position

Phase: 09 (image-task-planner-dag-executor) — EXECUTING
Plan: 3 of 3
Status: Ready to execute
Last activity: 2026-05-03

## Performance Metrics

**Velocity:**

- Total plans completed: 18
- Average duration: 2.6 min
- Total execution time: 0.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-core-enhancements | 2/2 | 4 min | 2 min |
| 02-post-processing | 2/2 | 3 min | 1.5 min |
| 03-asset-pipeline | 2/2 | 2 min | 1 min |
| 05-capability-layer-image-op-first-2-caps | 3/3 | 9 min | 3 min |
| 06-run-session-artifact-layer | 2/2 | 11 min | 5.5 min |
| 07 | 3 | - | - |
| 08 | 2 | - | - |

**Recent Trend:**

- Last 5 plans: 05-01 (4 min), 05-02 (3 min), 05-03 (2 min), 06-01 (4 min), 06-02 (7 min)
- Trend: Phase 6 completed with the run artifact layer wired into image_op and startup retention.
- Note: Phase 7 can now consume persistent `.runs/<runId>/` artifacts for eval outputs.

*Updated after each plan completion*
| Phase 07-eval-harness-golden-set P01 | 11min | 4 tasks | 28 files |
| Phase 07-eval-harness-golden-set P02 | 11min | 4 tasks | 12 files |
| Phase 09-image-task-planner-dag-executor P01 | 9min | 10 tasks | 18 files |
| Phase 09-image-task-planner-dag-executor P02 | 10min | 11 tasks | 11 files |

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
- [Phase 06]: Vitest 2.x is the Phase 6 test framework; tsconfig remains unchanged because tests run through Vitest transform.
- [Phase 06]: Run artifact roots resolve from server-level IMAGE_GEN_OUTPUT_DIR via getOutputDir(), not per-call outputDir.
- [Phase 06]: Trace nodes preserve latencyMs while adding startedAtMs, endedAtMs, durationMs, outcome, and artifactPath.
- [Phase 06]: image_op writes in-progress manifests before capability execution and final success/error manifests after.
- [Phase 06]: retentionHours=0 deletes all eligible run directories, including just-created runs.
- [Phase 07]: Ignored eval/results/ because npm run eval produces runtime verification artifacts.
- [Phase 07]: Kept OCR scoring as a deterministic skipped scorer until Phase 8 adds OCR dependencies.
- [Phase 07]: Generated deterministic local PNG fixtures with sharp instead of using network or AI image generation.
- [Phase 07]: Second providers for an existing op require non-empty quality.scores unless allowUnscoredProduction is explicitly passed.
- [Phase 07]: Eval score application ignores skipped, errored, non-finite, and model-version-mismatched results.
- [Phase 07]: runEval() writes result JSON first, then applies that result in-process so quality.evalResultPath points at the persisted artifact.
- [Phase 07]: Gap closure will bring tesseract.js into the eval harness now so OCR scoring runs before Phase 8's user-facing analyze_ocr capability.
- [Phase 09]: Plan validation gates budget caps on recomputed node costs before provider calls — Matches 09-01 success criteria and prevents Haiku self-reported estimate drift from bypassing constraints.
- [Phase 09]: DAG execution is sequential Kahn-order with ready-queue shape preserved for Phase 10 bounded parallelism.
- [Phase 09]: Best partial selection is image-only BFS from terminalNodeId over dependsOn, preserving dependency order for ties.

### Pending Todos

- Add new deps before later execution: `@anthropic-ai/sdk` (P9)
- New env var documentation still needed: `ANTHROPIC_API_KEY` (P9)

### Blockers/Concerns

- None currently. Phase 7 (eval) is on the critical path before Phase 11 (provider breadth) — second-provider-per-op requires measured eval score before shipping.

## Session Continuity

Last session: 2026-05-03T16:13:27.963Z
Stopped at: Completed 09-02-PLAN.md
Resume file: None

## Quick Tasks

- 2026-04-24 — 260424-h6z — Added `npm run check-models` inventory script (scripts/check-models.ts + README section). Detected drift: xAI default `grok-2-image` no longer in listing (now `grok-imagine-image` / `-pro`); Gemini 3 preview variants available.
- 2026-04-24 — 260424-heb — Bumped Grok provider default from `grok-2-image` to `grok-imagine-image` in lockstep across `src/providers/grok.ts`, `KNOWN_DEFAULTS` mirror in `scripts/check-models.ts`, and both README model tables. Retained `grok-2-image` as callable override. Replaced incorrect `grok-imagine` shorthand with real xAI API IDs. Build passes. No behavior change to `generate()`.
