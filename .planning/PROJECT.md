# Image-Gen MCP v2 — Asset Pipeline

## What This Is

A personal Model Context Protocol server providing a complete image asset pipeline — from generation through post-processing — across multiple AI providers (OpenAI, Gemini, Replicate, Together AI, Grok). Serves as the single image tool for all Claude Code sessions, eliminating per-project image tooling.

## Core Value

One MCP call produces a ready-to-use image asset — generated, processed, and saved — without manual post-processing steps.

## Requirements

### Validated

- ✓ Single `generate_image` tool generates images from text prompts — existing
- ✓ 5 provider implementations (OpenAI, Gemini, Replicate, Together AI, Grok) — existing
- ✓ Provider self-registration at startup with graceful API key detection — existing
- ✓ Unified size abstraction (square/landscape/portrait) across all providers — existing
- ✓ Auto-generated filenames with date/provider/hash pattern — existing
- ✓ Configurable output directory via `IMAGE_GEN_OUTPUT_DIR` — existing
- ✓ Configurable default provider via `IMAGE_GEN_DEFAULT_PROVIDER` — existing

### Active

- [ ] Output path control (`outputPath` and `outputDir` parameters)
- [ ] Provider fallback chain (Grok → Gemini → OpenAI → Replicate → Together)
- [ ] Style parameter for generation prompts
- [ ] Image post-processing (resize, crop, aspect crop, circle mask)
- [ ] Asset type presets (profile_pic, post_image, hero_photo, avatar, scene)
- [ ] Combined generate + process pipeline (`generate_asset` tool)
- [ ] Reference image support for character consistency
- [ ] Context-dependent fallback chains (with/without reference)
- [ ] Batch generation with manifest output
- [ ] Change default provider from openai to grok

### Out of Scope

- Image editing via inpainting — different tool, different complexity
- Video/animation — still images only
- Cloud storage (S3, CDN) — local disk only, personal tool
- User-facing UI — MCP server consumed by Claude Code only
- Caching/deduplication — same prompt generates new image every time
- Cost tracking — check provider dashboards directly
- NSFW filtering — rely on provider-side content policies
- JPEG/WebP output — PNG only (transparency needed for circle masks)

## Context

- **Existing codebase**: v1.0 with single `generate_image` tool, 5 providers, TypeScript + MCP SDK
- **Primary consumer**: socialstory project (needs character assets, scene images, profile pics)
- **Architecture**: Provider registry pattern with factory functions, Zod validation
- **New dependency**: `sharp` for image processing (resize, crop, mask)
- **Provider preference**: Grok produces best results → should be default and first in chain
- **Reference image limitation**: Grok and Together don't support reference images, creating a tension between quality preference and consistency needs

## Constraints

- **Tech stack**: TypeScript, MCP SDK, sharp for image processing — must run as stdio MCP server
- **Provider APIs**: Reference image support varies by provider — OpenAI (edit API), Gemini (multi-modal), Replicate (model-dependent), Together/Grok (none)
- **PNG only**: All output is PNG — needed for circle mask transparency
- **Sequential batch**: Batch runs sequentially to avoid rate limits
- **Personal tool**: Opinionated defaults over configuration surface area

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Grok as default provider | Best quality for Ben's use cases | — Pending |
| sharp for image processing | Standard Node.js library, no ImageMagick dependency | — Pending |
| Fallback chain in utility, not providers | Keeps providers testable, fallback logic centralized | — Pending |
| Sequential batch execution | Avoids rate limits, simpler error handling | — Pending |
| PNG-only output | Transparency needed for circle masks | — Pending |
| Two-pass reference strategy | Hero via Grok (quality), derivatives via OpenAI/Gemini (consistency) | — Pending |

---
*Last updated: 2026-01-29 after initialization*
