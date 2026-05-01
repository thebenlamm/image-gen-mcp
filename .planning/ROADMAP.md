# Roadmap: Image-Gen MCP

## Overview

**v1.0 — Asset Pipeline (shipped):** Transformed the image generation MCP from a thin text-to-image wrapper into an asset pipeline — generation through post-processing — delivering ready-to-use image assets in a single call.

**v2.0 — Goal-Shaped Image MCP (in progress):** Expand the surface from narrow primitives into a capability-routed system. Adds `image_op` (escape-hatch direct-op tool) and `image_task` (goal-handoff tool with internal Haiku planner + DAG executor). Existing v1.0 tools (`generate_image`, `process_image`, `generate_asset`) remain unchanged.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, ...): Planned milestone work; numbering continues across milestones (v1.0 = 1-4, v2.0 = 5-11)
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

### v1.0 — Asset Pipeline

- [x] **Phase 1: Core Enhancements** - Enhanced generation with output control, style modifiers, and size-aware provider selection
- [x] **Phase 2: Post-Processing** - Image processing operations (resize, crop, aspect crop, circle mask)
- [x] **Phase 3: Asset Pipeline** - High-level asset generation with presets
- [~] **Phase 4: Reference Images** - SUPERSEDED by v2.0 Phase 5 (REF-* requirements subsumed by CAP/OP/PRIM)

### v2.0 — Goal-Shaped Image MCP

- [ ] **Phase 5: Capability Layer + image_op + first 2 caps** - Capability registry parallel to ImageProvider; `image_op` MCP tool; first capabilities (`extract_subject` via @imgly, `edit_prompt` via gpt-image-1)
- [ ] **Phase 6: Run/Session Artifact Layer** - Persistent run artifacts under `.runs/<runId>/` with retention sweep
- [ ] **Phase 7: Eval Harness + Golden Set** - Programmatic scoring populates capability quality scores so the planner routes on measurement
- [ ] **Phase 8: Op Primitives Expansion** - composite, transform, upscale, analyze_* capabilities
- [ ] **Phase 9: image_task Planner + DAG Executor** - Goal-shaped MCP tool with Haiku-planned DAG execution
- [ ] **Phase 10: Template Fast-Paths + Executor Parallelism** - Skip planner LLM for matching template signatures; concurrent DAG node execution
- [ ] **Phase 11: Provider Breadth (Post-Eval)** - Photoroom, fal.ai, Flux Kontext, Ideogram added against measured registry

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
- [x] 01-01-PLAN.md — Output path control, default provider change to grok, startup logs
- [x] 01-02-PLAN.md — Style parameter, size-aware provider selection, enhanced error responses

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
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — Image processing engine (resize, crop, aspect crop, circle mask) with sharp
- [x] 02-02-PLAN.md — process_image MCP tool with operation chaining and size metadata response
**UI hint**: yes

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
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md — Asset preset definitions and clean filename support
- [x] 03-02-PLAN.md — generate_asset MCP tool registration

### Phase 4: Reference Images — SUPERSEDED
**Status**: Superseded by v2.0 Phase 5 (Capability Layer)
**Goal (original)**: Users can generate consistent character images across multiple outputs using reference images
**Depends on**: Phase 3
**Requirements (original)**: REF-01, REF-02, REF-03, REF-04, REF-05, REF-06, REF-07
**Supersession rationale**: All REF-* requirements are subsumed by v2.0's first-class `input_images` parameter on `image_op` and `image_task`, plus the `edit_prompt` capability on gpt-image-1 (PRIM-02). The `referenceImage`/`referenceWeight` parameter approach is replaced by capability-routed input handling. Provider fallback chains (REF-06/07) are replaced by capability registry routing (CAP-01..05) with measured quality scores (EVAL-01..05).
**Plans**: Not started; will not be executed

Plans:
- [ ] 04-01-PLAN.md — (Superseded; not executed)
- [ ] 04-02-PLAN.md — (Superseded; not executed)

---

### Phase 5: Capability Layer + image_op + First 2 Caps
**Goal**: Developers can register and invoke arbitrary (op, provider) pairs through `image_op` without modifying the existing `ImageProvider` interface; users can extract subjects and edit images via prompt
**Depends on**: Phase 3 (uses existing `resolveOutputPath`, `saveImage`)
**Requirements**: CAP-01, CAP-02, CAP-03, CAP-04, CAP-05, OP-01, OP-02, OP-03, OP-04, PRIM-01, PRIM-02
**Success Criteria** (what must be TRUE):
  1. From Claude Code, calling `image_op` with `{op: 'extract_subject', provider: '@imgly/local', params: {input: '/path/to/photo.png'}}` returns a saved path to a clean alpha cutout
  2. From Claude Code, calling `image_op` with `{op: 'edit_prompt', provider: 'openai', params: {input: '/path/to/photo.png', prompt: '...'}}` returns a saved path to an edited image via gpt-image-1
  3. Calling `image_op` with an unregistered `(op, provider)` pair returns a clear "capability not registered" error before any provider HTTP call
  4. Calling `image_op` with prompt or size violating capability constraints returns a constraint-violation error before the provider call
  5. The five existing v1.0 providers (`src/providers/*`) remain unmodified; an "extract-only" capability registers without implementing `ImageProvider.generate()`
**Plans**: 2-3 plans
**UI hint**: no

### Phase 6: Run/Session Artifact Layer
**Goal**: Every `image_op` (and future `image_task`) invocation produces a uniquely-identified run with persistent intermediate artifacts and bounded retention
**Depends on**: Phase 5
**Requirements**: RUN-01, RUN-02, RUN-03, RUN-04, RUN-05
**Success Criteria** (what must be TRUE):
  1. Every `image_op` response includes a `runId` (timestamp + random hex) the user can reference
  2. Intermediate artifacts appear at `<outputDir>/.runs/<runId>/n<nodeId>.png` and are written atomically (tmp + rename)
  3. Setting `IMAGE_GEN_RUN_RETENTION_HOURS=1` and restarting the server deletes runs older than 1 hour from disk
  4. Default retention (24 hours) applies when env var unset
  5. Trace shape returned by `image_op` matches the multi-node trace shape used later by `image_task` (single-node case proves the contract)
**Plans**: 2 plans
**UI hint**: no

### Phase 7: Eval Harness + Golden Set
**Goal**: `npm run eval` produces measured quality scores for every registered capability, populating the registry so future planner routing is evidence-based
**Depends on**: Phase 6 (uses run artifacts for eval outputs); can run in parallel with Phase 8
**Requirements**: EVAL-01, EVAL-02, EVAL-03, EVAL-04, EVAL-05
**Success Criteria** (what must be TRUE):
  1. `eval/fixtures/` contains 10 input images covering subject types (product, person, text-heavy, transparent-edge, low-contrast)
  2. `npm run eval` exits 0 and writes `eval/results/<date>.json` with scored entries for the Phase 5 capabilities (`extract_subject`, `edit_prompt`)
  3. Eval results populate `quality.scores` on registered capabilities; `quality.scores` is `undefined` for any capability without an eval case
  4. Adding a second provider for an existing op without an eval case produces a registration error or a clear "unscored" warning that blocks production routing
  5. Programmatic scorers (pixelmatch ΔE for edits, alpha coverage for extract, OCR round-trip for text-bearing edits) run without manual intervention
**Plans**: 2 plans
**UI hint**: no

### Phase 8: Op Primitives Expansion
**Goal**: Users can invoke composite, transform, upscale, and analyze operations via `image_op`, completing the op taxonomy needed by the planner
**Depends on**: Phase 6 (uses run artifacts); can run in parallel with Phase 7
**Requirements**: PRIM-03, PRIM-04, PRIM-05, PRIM-06, PRIM-07, PRIM-08
**Success Criteria** (what must be TRUE):
  1. `image_op` invocable with `op: 'composite_layers'` (sharp-backed, alpha-aware) returns a saved composited PNG
  2. `image_op` invocable with `op: 'transform'` wraps existing `processing.ts` operations (resize/crop/aspectCrop/circleMask) as a single capability
  3. `image_op` invocable with `op: 'enhance_upscale'` (Replicate Real-ESRGAN) returns a higher-resolution image
  4. `image_op` invocable with `op: 'analyze_dimensions'` returns `{w, h, format, channels, hasAlpha}` from sharp metadata
  5. `image_op` invocable with `op: 'analyze_palette'` and `op: 'analyze_ocr'` return dominant colors and extracted text respectively
**Plans**: 2-3 plans
**UI hint**: no

### Phase 9: image_task Planner + DAG Executor
**Goal**: Users can hand off a natural-language goal and receive a final image plus a structured trace, with the MCP planning and executing the DAG internally
**Depends on**: Phase 7 (planner routes on measured scores) and Phase 8 (full op coverage)
**Requirements**: TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, TASK-07, TASK-08, TASK-09, TASK-10
**Success Criteria** (what must be TRUE):
  1. From Claude Code, calling `image_task` with `{goal: "remove the background and place this on a clean white studio surface, 2000px square", input_images: ['/path/to/product.jpg']}` returns a final image path plus a trace showing `extract_subject → composite_layers → transform`
  2. Calling with `{dry_run: true}` returns the validated Plan (steps, providers, estimated cost) without executing any provider calls
  3. Setting `constraints.budget_cap_usd: 0.005` against a goal whose plan exceeds the cap returns a hard error at plan time, not after partial execution
  4. When a DAG node fails mid-execution, the trace identifies the failed node and the response includes the best partial result instead of nothing
  5. Trace includes per-node `cost_usd`, `latency_ms`, `revisedPrompt` (when present), and saved artifact paths — never base64 image data
**Plans**: 3 plans
**UI hint**: no

### Phase 10: Template Fast-Paths + Executor Parallelism
**Goal**: Common goal patterns skip the planner LLM entirely, and independent DAG nodes execute concurrently with bounded libvips usage
**Depends on**: Phase 9
**Requirements**: TMPL-01, TMPL-02, TMPL-03, TMPL-04
**Success Criteria** (what must be TRUE):
  1. `image_task` with a goal matching an `ASSET_PRESETS` template (e.g., `profile_pic`) executes without a Haiku call; trace shows `plannerMethod: 'template'`
  2. New templates `product-on-white`, `logo-cleanup`, and `upscale-export` match their respective goal signatures and skip the planner
  3. A bug fix to `ASSET_PRESETS` (in `src/utils/presets.ts`) propagates to v2.0 templates without a forked copy (templates import by reference)
  4. Setting `constraints.budget_cap_usd: 0.005` either matches a template-only path or returns a hard error (planner LLM is too expensive for that cap)
  5. Executing a multi-node DAG with two independent extract operations runs them concurrently with sharp/libvips concurrency capped at 2 (no OOM under realistic input)
**Plans**: 2 plans
**UI hint**: no

### Phase 11: Provider Breadth (Post-Eval)
**Goal**: Users can route through Photoroom, fal.ai, Flux Kontext, and Ideogram for capabilities where they measurably outperform existing providers
**Depends on**: Phase 10 (proves template fast-paths route correctly when many providers exist)
**Requirements**: PROV-01, PROV-02, PROV-03, PROV-04, PROV-05
**Success Criteria** (what must be TRUE):
  1. `image_task` with `{goal: "...", constraints: {quality_tier: 'best'}}` for a product-photography goal routes to Photoroom (verifiable in trace)
  2. `image_task` with `{constraints: {quality_tier: 'fast'}}` for a Replicate-class capability routes to a fal.ai mirror when fal.ai's measured cost/latency wins
  3. Flux Kontext is registered for `edit_prompt` (no-mask instruction edit) and selectable when its measured edit-quality score exceeds gpt-image-1's
  4. Ideogram is registered for `generate` with a measured text-fidelity score that the planner uses for text-heavy goals
  5. Each new provider has at least one eval case before its `quality.score` is populated; provider registration fails or warns if no eval case exists
**Plans**: 2-3 plans
**UI hint**: no

## Progress

**Execution Order:**
Phases execute in numeric order with one parallelization window:
- Sequential: 1 → 2 → 3 → 4 (superseded) → 5 → 6
- **Parallel after Phase 6**: Phase 7 (eval harness, in `eval/`) and Phase 8 (op primitives, in `src/capabilities/`) touch different files and can be developed in parallel
- Sequential resumes: → 9 → 10 → 11

**v1.0 Status (Asset Pipeline)**

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Enhancements | 2/2 | ✓ Complete | 2026-01-30 |
| 2. Post-Processing | 2/2 | ✓ Complete | 2026-01-30 |
| 3. Asset Pipeline | 2/2 | ✓ Complete | 2026-01-30 |
| 4. Reference Images | 0/2 | Superseded by v2.0 P5 | - |

**v2.0 Status (Goal-Shaped Image MCP)**

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 5. Capability Layer + image_op | 0/2-3 | Not started | - |
| 6. Run/Session Artifact Layer | 0/2 | Not started | - |
| 7. Eval Harness + Golden Set | 0/2 | Not started (parallel with 8) | - |
| 8. Op Primitives Expansion | 0/2-3 | Not started (parallel with 7) | - |
| 9. image_task Planner + DAG Executor | 0/3 | Not started | - |
| 10. Template Fast-Paths + Parallelism | 0/2 | Not started | - |
| 11. Provider Breadth (Post-Eval) | 0/2-3 | Not started | - |
