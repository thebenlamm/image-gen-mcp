# Requirements: Image-Gen MCP

**Defined:** 2026-01-29 (v1.0) | Updated 2026-05-01 (v2.0)
**Core Value:** Two value props — guaranteed primitives (v1.0) and flexible goal handoff (v2.0).

## v1.0 Requirements (Shipped)

### Core Enhancements

- [x] **CORE-01**: User can specify exact output file path via `outputPath` parameter
- [x] **CORE-02**: User can specify output directory via `outputDir` parameter (auto-generates filename)
- [x] **CORE-03**: Default provider changes from openai to grok *(later reverted; OpenAI gpt-image-1 is current default)*
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

- [x] **ASSET-01**: `generate_asset` tool combines generation + post-processing in one call
- [x] **ASSET-02**: `profile_pic` preset: square generation, 1:1 crop, circle mask, resize 200x200
- [x] **ASSET-03**: `post_image` preset: landscape generation, 16:9 crop, resize 1200x675
- [x] **ASSET-04**: `hero_photo` preset: portrait generation, 9:16 crop, resize 1080x1920
- [x] **ASSET-05**: `avatar` preset: square generation, 1:1 crop, circle mask, resize 80x80
- [x] **ASSET-06**: `scene` preset: landscape generation, 16:9 crop, resize 1200x675
- [x] **ASSET-07**: Asset ID-based output produces clean filenames (no date/hash prefix)

## v2.0 Requirements (Goal-Shaped Image MCP)

### Capability Layer (CAP)

- [ ] **CAP-01**: Developer can register a capability via `CapabilityRegistry.register({op, provider, modelVersion, constraints, cost, latencyMsP50, invoke})` without modifying `ImageProvider`
- [ ] **CAP-02**: An "extract-only" provider can register without implementing `ImageProvider.generate()` (no fake stubs)
- [ ] **CAP-03**: `CapabilityRegistry` exposes `get(op, provider)`, `list(op)`, `listByProvider(provider)` for routing
- [ ] **CAP-04**: Capability `quality.scores` is `undefined` until populated by eval; planner cannot route on quality without scores
- [ ] **CAP-05**: Changing a capability's `modelVersion` invalidates its `quality.scores` (must be re-evaluated before planner trusts it)

### image_op Tool (OP)

- [ ] **OP-01**: User can call `image_op` MCP tool with `{op, provider, params}` and receive `{output, runId, trace}`
- [ ] **OP-02**: `image_op` validates `(op, provider)` is registered; clear error if capability missing
- [ ] **OP-03**: `image_op` surfaces capability-constraint violations (prompt too long, unsupported size) before calling the provider
- [ ] **OP-04**: `image_op` accepts image inputs as file paths and saves outputs via existing `resolveOutputPath` rules

### Run / Session Artifact Layer (RUN)

- [ ] **RUN-01**: Each task invocation generates a unique `runId` (timestamp + random hex)
- [ ] **RUN-02**: Intermediate artifacts saved to `<outputDir>/.runs/<runId>/n<nodeId>.png` via atomic write (tmp + rename)
- [ ] **RUN-03**: `IMAGE_GEN_RUN_RETENTION_HOURS` env var controls cleanup (default 24)
- [ ] **RUN-04**: Retention sweep runs at server startup; deletes runs older than threshold
- [ ] **RUN-05**: `image_op` and `image_task` return `runId` in response so users can locate intermediates

### Eval Harness (EVAL)

- [ ] **EVAL-01**: `eval/fixtures/` contains 10 input images covering subject types (product, person, text-heavy, transparent-edge, low-contrast)
- [ ] **EVAL-02**: `eval/cases/` contains per-capability test definitions (input fixture + expected scoring criteria)
- [ ] **EVAL-03**: `npm run eval` executes all cases with per-op programmatic scorers (pixelmatch, alpha coverage, OCR round-trip), writes `eval/results/<date>.json`
- [ ] **EVAL-04**: Eval results populate `quality.scores` on registered capabilities
- [ ] **EVAL-05**: Adding a second provider for an existing op requires an eval case and measured score before the capability can ship to production

### Op Primitives (PRIM)

- [ ] **PRIM-01**: `extract_subject` capability available via `@imgly/background-removal-node` (local, no API key required)
- [ ] **PRIM-02**: `edit_prompt` capability available via OpenAI `gpt-image-1` edit endpoint
- [ ] **PRIM-03**: `composite_layers` capability available via sharp (local, deterministic, alpha-aware)
- [ ] **PRIM-04**: `transform` capability available via sharp, wrapping existing `processing.ts` operations
- [ ] **PRIM-05**: `enhance_upscale` capability available via Replicate Real-ESRGAN
- [ ] **PRIM-06**: `analyze_dimensions` returns `{w, h, format, channels, hasAlpha}` via sharp
- [ ] **PRIM-07**: `analyze_palette` returns dominant colors via sharp
- [ ] **PRIM-08**: `analyze_ocr` returns extracted text via `tesseract.js`

### image_task Planner + DAG Executor (TASK)

- [ ] **TASK-01**: User can call `image_task` MCP tool with `{goal, input_images?, constraints?}`
- [ ] **TASK-02**: `constraints` accepts `{output_size, output_format, quality_tier, budget_cap_usd, latency_cap_seconds, style_refs}`
- [ ] **TASK-03**: Planner (Anthropic Claude Haiku) emits a JSON Plan validated against the capability registry
- [ ] **TASK-04**: `dry_run: true` returns the Plan without executing; user can preview estimated cost and provider choices
- [ ] **TASK-05**: `budget_cap_usd` is enforced at plan time; hard fail with clear error if estimated cost exceeds cap
- [ ] **TASK-06**: DAG executor walks the plan; independent nodes run concurrently (libvips concurrency capped at 2)
- [ ] **TASK-07**: Per-node try/catch; on failure, executor saves best partial result and surfaces error in trace
- [ ] **TASK-08**: Response includes `{output, runId, trace, total_cost_usd, total_latency_ms}` with per-node detail
- [ ] **TASK-09**: Trace returns paths only, never base64 image data
- [ ] **TASK-10**: `revisedPrompt` from any generate node surfaces in trace so multi-step plans show what models actually rendered

### Templates + Fast-Paths (TMPL)

- [ ] **TMPL-01**: Template table imports existing `ASSET_PRESETS` by reference (not forked); fixes propagate to v1.0 `generate_asset`
- [ ] **TMPL-02**: Template matcher runs before planner LLM; if `goal + constraints` matches a template signature, skip the Haiku call
- [ ] **TMPL-03**: New templates added: `product-on-white`, `logo-cleanup`, `upscale-export`
- [ ] **TMPL-04**: Planner-skip enforced when `constraints.budget_cap_usd < $0.01` — must match a template or fail

### Provider Breadth (PROV) — Post-Eval

- [ ] **PROV-01**: Photoroom registered for `extract_subject` (with shadow) and `composite_layers` (product photography)
- [ ] **PROV-02**: fal.ai registered as faster/cheaper mirror for Replicate-class capabilities
- [ ] **PROV-03**: Flux Kontext registered for `edit_prompt` (no-mask instruction edit, on Replicate or BFL direct)
- [ ] **PROV-04**: Ideogram registered for `generate` with measured text-fidelity score
- [ ] **PROV-05**: Each new provider has at least one eval case before its `quality.score` is populated

## Superseded Requirements

| Req | Original Intent | Superseded By |
|-----|-----------------|---------------|
| CORE-04/05/06 | Provider fallback chain with env-var ordering | Capability registry + planner routing (CAP-01..05, TASK-03) |
| REF-01/02 | `referenceImage` + `referenceWeight` params on `generate_image` | `input_images` first-class on `image_op` and `image_task` (OP-04, TASK-01) |
| REF-03 | OpenAI edit API for reference images | `edit_prompt` capability on gpt-image-1 (PRIM-02) |
| REF-04 | Gemini multi-modal reference | Future capability registration (deferred) |
| REF-05 | `supportsReference` flag on ImageProvider | Capability registry replaces feature flags entirely |
| REF-06/07 | Context-dependent fallback chain + env-var config for reference providers | Planner routing on measured capability scores (TASK-03) |

## Future Requirements (Post-v2.0)

### Batch Operations

- **BATCH-01**: `generate_batch` tool generates multiple images in one call
- **BATCH-02**: Batch runs sequentially with early-fail-continue semantics
- **BATCH-03**: Manifest JSON tracks prompt, provider, asset type, success/failure per asset
- **BATCH-04**: Failed assets don't stop remaining assets from generating

### Possible v2.x Capabilities

- Gemini multi-modal `edit_prompt` capability (REF-04 reframed)
- `enhance_relight` via Clipdrop / IC-Light
- `enhance_denoise` via Magnific or open models
- Mockup generation cap via Smartmockups / Placeit
- Video generation deferred indefinitely (out of scope per v1.0 decision)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Video/animation | Still images only |
| Cloud storage (S3, CDN) | Local disk only, personal tool |
| User-facing UI | MCP server consumed by Claude Code only |
| Caching/deduplication | Same goal generates fresh result every time |
| Cross-run cost dashboard | Per-run cost in trace; no aggregation surface |
| NSFW filtering | Rely on provider-side content policies |
| JPEG/WebP output | PNG only — transparency needed for circle masks and intermediate alpha |
| Streaming progress events | Trace returned at completion; MCP streaming support varies |

## v2.0 Success Criteria (Falsifiable)

After Phase 9 (image_task ships):
- 30 held-out goal-shaped prompts across 5 categories (extract+composite, edit, upscale, generate+post-process, analyze): ≥80% rated by user as "matches the goal" without manual intervention
- Median cost per `image_task` call < $0.10
- Median latency per `image_task` call < 30s
- Trace sufficient to identify failed node when one fails

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01..03, CORE-07, CORE-08 | 1 | Complete |
| PROC-01..06 | 2 | Complete |
| ASSET-01..07 | 3 | Complete |
| CORE-04/05/06, REF-01..07 | — | Superseded by v2.0 |
| CAP-01..05, OP-01..04, PRIM-01, PRIM-02 | 5 | Pending (v2.0 P5) |
| RUN-01..05 | 6 | Pending (v2.0 P6) |
| EVAL-01..05 (P1 caps) | 7 | Pending (v2.0 P7) |
| PRIM-03..08 | 8 | Pending (v2.0 P8) |
| TASK-01..10 | 9 | Pending (v2.0 P9) |
| TMPL-01..04 | 10 | Pending (v2.0 P10) |
| PROV-01..05 | 11 | Pending (v2.0 P11) |

**Coverage (v2.0):**
- v2.0 requirements: 41 total (CAP 5, OP 4, RUN 5, EVAL 5, PRIM 8, TASK 10, TMPL 4, PROV 5)
- Mapped to phases: filled by roadmapper
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-29 (v1.0) | v2.0 added: 2026-05-01*
