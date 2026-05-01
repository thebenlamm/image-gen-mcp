# Image-Gen MCP — Goal-Shaped Image System

## What This Is

A personal Model Context Protocol server providing a complete image asset pipeline across multiple AI providers (OpenAI, Gemini, Replicate, Together AI, Grok). Serves as the single image tool for all Claude Code sessions, eliminating per-project image tooling.

**v2.0 expands** the surface from narrow text-to-image + post-processing tools into a **goal-shaped capability-routed system** — `image_task` accepts a natural-language goal, internally plans a DAG of operations, and executes across providers chosen by a measured capability registry. Existing v1.0 tools (`generate_image`, `process_image`, `generate_asset`) remain unchanged for users who want narrow, predictable primitives.

## Core Value

Two value props, one MCP:
1. **Guaranteed primitives** (v1.0): Narrow tools with predictable behavior — `generate_asset(prompt, assetType)` returns a finished file.
2. **Flexible goal handoff** (v2.0): `image_task(goal, inputs?, constraints?)` plans + executes multi-step workflows the calling LLM doesn't have to chain manually.

## Current Milestone: v2.0 Goal-Shaped Image MCP

**Goal:** Add `image_task` (goal-handoff tool with internal planner + DAG executor) and `image_op` (escape-hatch tool for direct op invocation), turning the MCP from a thin provider wrapper into a capability-routed image system. Existing v1.0 surface stays intact.

**Target features:**
- Capability registry parallel to ImageProvider (no breaking changes to existing 5 providers)
- `image_op` MCP tool: direct invocation of any (op, provider) pair for debugging and power use
- `image_task` MCP tool: goal-shaped input → Haiku-planned DAG → executed via capability registry → final image + structured trace
- Run/session artifact layer with intermediate artifacts under `<outputDir>/.runs/<runId>/`
- Eval harness with golden fixtures and programmatic scoring (pixelmatch, alpha coverage, OCR round-trip) — populates capability quality scores so the planner routes on measurement, not vibes
- Op primitives: `extract_subject`, `edit_prompt`, `edit_mask`, `composite_layers`, `transform`, `enhance_upscale`, `analyze_dimensions/palette/ocr`
- Template fast-paths: `ASSET_PRESETS` imported by reference into the planner template table; planner LLM skipped for matching goals
- Provider breadth: Photoroom, fal.ai, Flux Kontext, Ideogram — added against measured registry, eval-gated

**Plan reference:** `/Users/benlamm/.claude/plans/ok-let-s-do-it-zany-seahorse.md`

## Requirements

### Validated

- ✓ Single `generate_image` tool generates images from text prompts
- ✓ 5 provider implementations (OpenAI, Gemini, Replicate, Together AI, Grok)
- ✓ Provider self-registration at startup with graceful API key detection
- ✓ Unified size abstraction (square/landscape/portrait) across all providers
- ✓ Auto-generated filenames with date/provider/hash pattern
- ✓ Configurable output directory via `IMAGE_GEN_OUTPUT_DIR`
- ✓ Configurable default provider via `IMAGE_GEN_DEFAULT_PROVIDER`
- ✓ Output path control (`outputPath` and `outputDir` parameters)
- ✓ Style parameter for generation prompts
- ✓ Image post-processing (resize, crop, aspect crop, circle mask) via `process_image`
- ✓ Asset type presets (profile_pic, post_image, hero_photo, avatar, scene, avery_*) via `generate_asset`
- ✓ Combined generate + process pipeline (`generate_asset` tool)

### Active (v2.0)

See `.planning/REQUIREMENTS.md` for full requirement list with REQ-IDs. Categories:
- **CAP** — Capability layer + registry
- **OP** — `image_op` escape-hatch tool
- **RUN** — Run/session artifact layer
- **EVAL** — Eval harness + golden set
- **PRIM** — Op primitives expansion
- **TASK** — `image_task` planner + DAG executor
- **TMPL** — Template fast-paths + executor parallelism
- **PROV** — Provider breadth

### Superseded

- ~~Provider fallback chain (CORE-04/05/06)~~ — Superseded by capability registry + planner routing in v2.0
- ~~Reference image support via referenceImage param (REF-01/02/05/06/07)~~ — Superseded by `input_images` first-class on `image_op` and `image_task`
- ~~OpenAI edit API for reference images (REF-03)~~ — Subsumed by CAP-02 (`edit_prompt` cap on gpt-image-1)
- ~~Gemini multi-modal reference (REF-04)~~ — Becomes a future capability registration

### Out of Scope

- Video/animation — still images only
- Cloud storage (S3, CDN) — local disk only, personal tool
- User-facing UI — MCP server consumed by Claude Code only
- Caching/deduplication — same prompt generates new image every time
- Cost tracking dashboard — trace returns per-run cost; no cross-run aggregation
- NSFW filtering — rely on provider-side content policies
- JPEG/WebP output — PNG only (transparency needed for circle masks and intermediates)
- Batch generation tool — orthogonal to v2.0 goal-shaped design; deferred to a later milestone
- Replicate reference support — model-dependent, defer

## Context

- **Existing codebase**: v1.0 shipped with `generate_image`, `process_image`, `generate_asset`, 5 providers, sharp + Zod
- **Primary consumer**: socialstory project (needs character assets, scene images, profile pics) — plus general-purpose use across all Claude Code sessions
- **Architecture**: Provider registry pattern with factory functions. v2.0 adds parallel CapabilityRegistry — no changes to existing ImageProvider interface.
- **New deps for v2.0**: `@imgly/background-removal-node`, `@anthropic-ai/sdk`, `pixelmatch`, `tesseract.js`
- **New env var**: `ANTHROPIC_API_KEY` (planner), `IMAGE_GEN_RUN_RETENTION_HOURS` (intermediate artifact cleanup)
- **OpenAI default**: Currently `gpt-image-1` (rolled back from `gpt-image-2` pending org verification at https://platform.openai.com/settings/organization/general)

## Constraints

- **Tech stack**: TypeScript ES2022/NodeNext (ESM), strict mode, MCP SDK, sharp, Zod
- **MCP stdio response size**: Bounded — trace returns paths only, never base64 image data
- **Sharp/libvips concurrency**: Capped at 2 in DAG executor to prevent OOM on parallel composites
- **Personal tool**: Opinionated defaults over configuration surface area
- **Atomic commits**: Each phase and capability addition is independently shippable

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Grok as default provider | Best quality for Ben's use cases (early call) | Reversed — Grok mangles text; default is OpenAI gpt-image-1 |
| sharp for image processing | Standard Node.js library, no ImageMagick dependency | Validated in v1.0 |
| PNG-only output | Transparency needed for circle masks | Validated in v1.0 |
| Buffer-in/Buffer-out processing pattern | Composability and testability | Validated in v1.0 |
| Tagged union for ProcessingOperation | Type-safe operation dispatch | Validated in v1.0 |
| Path priority (outputPath > outputDir > env > default) | Predictable resolution | Validated in v1.0 |
| **CapabilityRegistry parallel to ImageProvider (NOT optional methods)** | Five existing providers untouched; "extract-only" providers don't need fake `generate()` stubs | v2.0 — Pending |
| **Drop ProviderName enum at capability layer (use plain string)** | Closed unions break every provider add | v2.0 — Pending |
| **Anthropic Claude Haiku as planner LLM** | Flexible enough for novel goals, $0.001-0.003/call | v2.0 — Pending |
| **Templates seed from ASSET_PRESETS by reference (not forked)** | Fixes propagate; v1.0 + v2.0 stay in sync | v2.0 — Pending |
| **Trace returns paths only, never base64** | MCP stdio response size bound | v2.0 — Pending |
| **Eval harness blocks second provider per op** | Without measured scores the planner picks on vibes | v2.0 — Pending |
| **`generate_asset` is NOT deprecated** | Two value props: flexible (`image_task`) vs guaranteed (`generate_asset`) | v2.0 — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-01 — Started milestone v2.0 (Goal-Shaped Image MCP)*
