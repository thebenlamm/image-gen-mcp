# Image-Gen MCP — Goal-Shaped Image System

## Current Milestone: None — v2.1 shipped 2026-05-11

Use `$gsd-new-milestone` to start the next milestone.

---

## Current State

**Shipped version:** v2.1 Brand Workflow Improvements, shipped 2026-05-11.

Image-Gen MCP is a personal Model Context Protocol server for creating image assets across local primitives and external AI providers. It now supports both narrow, predictable asset tools and flexible goal handoff:

1. `generate_image`, `process_image`, and `generate_asset` remain the stable v1.0 primitive/asset-pipeline surface.
2. `image_op` directly invokes registered `(op, provider)` capabilities for debugging and power use.
3. `image_task` accepts a natural-language image goal, validates or plans a DAG, executes it through the capability registry, and returns a final image path plus a structured trace.

## Core Value

Two value props, one MCP:

1. **Guaranteed primitives:** Narrow tools with predictable behavior; `generate_asset(prompt, assetType)` returns a finished file.
2. **Flexible goal handoff:** `image_task(goal, inputs?, constraints?)` plans and executes multi-step workflows the calling LLM does not need to chain manually.

## Shipped Capabilities

### Validated

- ✓ Text-to-image generation through OpenAI, Gemini, Replicate, Together AI, and Grok providers.
- ✓ Output path control, configurable output directory, style prompts, size abstraction, and size-aware provider selection.
- ✓ Image post-processing through sharp: resize, crop, aspect crop, and circle mask.
- ✓ Asset presets through `generate_asset`: profile images, posts, hero images, avatars, scenes, and Avery labels.
- ✓ Capability registry parallel to `ImageProvider`, with plain-string providers, invoke contracts, constraints, cost/latency metadata, and model-version quality invalidation.
- ✓ `image_op` direct operation tool with registered capability lookup, preflight validation, saved outputs, run IDs, manifests, and path-only traces.
- ✓ Run/session artifact layer with atomic intermediate writes under `.runs/<runId>/`, retention sweep, and trace/manifest contracts.
- ✓ Deterministic eval harness with golden fixtures, pixelmatch, alpha coverage, tesseract OCR scoring, result JSON, score application, and unscored-provider guardrails.
- ✓ Full op primitive taxonomy: `extract_subject`, `edit_prompt`, `generate`, `composite_layers`, `transform`, `enhance_upscale`, `analyze_dimensions`, `analyze_palette`, and `analyze_ocr`.
- ✓ `image_task` with Haiku planning, strict plan schema, 12-pass validation, input-root containment, DAG execution, retry/skip semantics, best partials, and binary/base64 response guards.
- ✓ Template fast paths for preset/profile/product/logo/upscale goals, with `ASSET_PRESETS` imported by reference and planner calls skipped when templates match.
- ✓ Bounded executor parallelism with sharp/libvips concurrency capped at 2.
- ✓ Provider breadth through Photoroom, fal Flux Kontext, and Ideogram, backed by deterministic eval cases and live provider UAT.

### Active

See REQUIREMENTS.md for v2.1 milestone requirements.

### Superseded

- ~~Provider fallback chain (CORE-04/05/06)~~ — Superseded by capability registry + planner routing.
- ~~Reference image support via `referenceImage` / `referenceWeight`~~ — Superseded by first-class `input_images` on `image_op` and `image_task`.
- ~~OpenAI edit API for reference images as a provider fallback path~~ — Subsumed by `edit_prompt` on `gpt-image-1`.
- ~~Gemini multi-modal reference as v1 provider logic~~ — Reframed as future capability registration if needed.

### Out of Scope

- Video/animation — still images only.
- Cloud storage (S3, CDN) — local disk only, personal tool.
- User-facing UI — MCP server consumed by coding agents.
- Caching/deduplication — same prompt can generate new output.
- Cross-run cost dashboard — traces expose per-run estimates; no analytics layer.
- NSFW filtering — rely on provider-side content policies.
- JPEG/WebP output — PNG remains the primary output because transparency matters for masks and intermediates.
- ~~Batch generation tool — deferred until there is a concrete workflow need.~~ — Promoted to v2.1 milestone after brand workflow beta feedback confirmed the need.

## Context

- **Tech stack:** TypeScript ES2022/NodeNext, strict mode, MCP SDK, sharp, Zod, Vitest.
- **Primary consumer:** local coding-agent sessions that need image generation, editing, analysis, and prepared assets without per-project image tooling.
- **Current codebase size:** 14,860 TypeScript lines across `src/`, `tests/`, and `scripts/`.
- **Automated verification:** 48 Vitest files, 304 tests passing at v2.0 close.
- **Provider credentials:** Optional provider keys unlock OpenAI, Gemini, Replicate, Together AI, Grok, Photoroom, fal, and Ideogram surfaces.
- **OpenAI default:** Currently `gpt-image-1`; `gpt-image-2` remains available when org verification and billing allow it.

## Constraints

- MCP stdio responses must stay bounded: traces return paths and compact metadata, never base64 image data.
- DAG execution keeps sharp/libvips concurrency capped at 2 to avoid memory spikes.
- Provider routing must prefer measured eval quality when available; second providers need valid eval evidence before production routing.
- Local filesystem inputs may be constrained with `IMAGE_GEN_INPUT_ROOT` for planner-driven workflows.
- Planning docs are milestone-scoped: completed roadmaps/requirements are archived under `.planning/milestones/`, and new milestones start with fresh requirements.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep v1 primitive tools alongside v2 goal handoff | Predictable primitives and flexible delegation serve different use cases | ✓ Validated |
| CapabilityRegistry parallel to ImageProvider | Existing providers stay stable; extract/analyze-only providers do not need fake `generate()` methods | ✓ Validated |
| Plain-string capability providers | Closed provider enums break every new integration | ✓ Validated |
| Trace returns paths only, never base64 | Keeps MCP responses bounded and auditable | ✓ Validated |
| Eval-gated second providers | Planner routing should use measured evidence, not provider vibes | ✓ Validated |
| Haiku planner for non-template `image_task` goals | Cheap enough for routing, flexible enough for novel goals | ✓ Validated |
| Templates import `ASSET_PRESETS` by reference | v1 preset fixes propagate to v2 templates | ✓ Validated |
| Sub-cent budgets require template routing | Planner calls alone can violate very low budgets | ✓ Validated |
| Sharp/libvips concurrency capped at 2 | Prevents parallel DAGs from creating avoidable memory pressure | ✓ Validated |
| Photoroom composite narrowed to single-subject Image Editing API | Avoids silently pretending Photoroom supports arbitrary layer placement | ✓ Validated |
| Provider failure does not silently fallback | Trace should expose chosen provider behavior honestly | ✓ Validated |

## Next Milestone Goals

Defined — see Current Milestone section above. v2.1 focus: brand workflow improvements (batch, routing transparency, text fidelity, style anchoring).

## Archives

- v2.0 roadmap archive: `.planning/milestones/v2.0-ROADMAP.md`
- v2.0 requirements archive: `.planning/milestones/v2.0-REQUIREMENTS.md`
- v2.0 audit: `.planning/milestones/v2.0-MILESTONE-AUDIT.md`
- v2.0 milestone summary: `.planning/MILESTONES.md`

---
*Last updated: 2026-05-11 — v2.1 milestone started*
