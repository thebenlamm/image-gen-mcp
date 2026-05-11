# Roadmap: Image-Gen MCP

## Milestones

- ✅ **v1.0 Asset Pipeline** — Phases 1-3 shipped 2026-01-30
- ✅ **v2.0 Goal-Shaped Image MCP** — Phases 5-11 shipped 2026-05-04
- 🚧 **v2.1 Brand Workflow Improvements** — Phases 12-15 (in progress)

## Phases

<details>
<summary>✅ v1.0 Asset Pipeline (Phases 1-3) — SHIPPED 2026-01-30</summary>

- [x] Phase 1: Core Enhancements (2/2 plans) — completed 2026-01-30
- [x] Phase 2: Post-Processing (2/2 plans) — completed 2026-01-30
- [x] Phase 3: Asset Pipeline (2/2 plans) — completed 2026-01-30

</details>

<details>
<summary>✅ v2.0 Goal-Shaped Image MCP (Phases 5-11) — SHIPPED 2026-05-04</summary>

- [x] Phase 4: Reference Images — resolved as superseded by v2.0 Phase 5
- [x] Phase 5: Capability Layer + image_op + First 2 Caps (3/3 plans) — completed 2026-05-01
- [x] Phase 6: Run/Session Artifact Layer (2/2 plans) — completed 2026-05-02
- [x] Phase 7: Eval Harness + Golden Set (3/3 plans) — completed 2026-05-02
- [x] Phase 8: Op Primitives Expansion (2/2 plans) — completed 2026-05-02
- [x] Phase 9: image_task Planner + DAG Executor (4/4 plans) — completed 2026-05-03
- [x] Phase 10: Template Fast-Paths + Executor Parallelism (2/2 plans) — completed 2026-05-03
- [x] Phase 11: Provider Breadth (Post-Eval) (3/3 plans) — completed 2026-05-04

</details>

### 🚧 v2.1 Brand Workflow Improvements (In Progress)

**Milestone Goal:** Close the gaps that make image-gen-mcp impractical for multi-image brand asset workflows — routing transparency, text fidelity, batch friction, and style consistency.

- [x] **Phase 12: Routing Transparency** - Register generate capabilities so list_capabilities shows all v1 providers with cost/latency/quality rows (completed 2026-05-11)
- [x] **Phase 13: Mockup Workflow** - Add image_task template for two-stage SVG composite mockup with pixel-perfect text fidelity (completed 2026-05-11)
- [x] **Phase 14: Batch Generation** - Add generate_batch tool for single-approval batched generation with batch-scoped run artifacts (Planning in progress) (completed 2026-05-11)
- [ ] **Phase 15: Style Anchoring** - Add reference_image parameter to generate_image and generate_batch to anchor scene geometry and lighting (Planning in progress)

## Phase Details

### Phase 12: Routing Transparency
**Goal**: Users can see all v1 text-to-image providers as first-class capability rows in list_capabilities, with cost/latency/quality metadata, and image_task can route generate ops using that measured data
**Depends on**: Phase 11
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03
**Success Criteria** (what must be TRUE):
  1. Calling list_capabilities shows (generate, openai), (generate, gemini), (generate, grok), (generate, replicate), and (generate, together) rows alongside existing op rows
  2. Each generate capability row includes cost, latencyMsP50, quality, and constraints fields in the same shape as existing registered capabilities
  3. image_task can route a generate node to a specific provider using quality.scores evidence from the generate capability registry entries
**Plans**: 3 plans
- [x] 12-01-PLAN.md — Create OpenAI, Gemini, Together generate capability adapters
- [x] 12-02-PLAN.md — Create Grok (with 1024-char limit enforcement) and Replicate generate capability adapters
- [x] 12-03-PLAN.md — Register all 6 generate caps (including Ideogram fix) and add smoke test

### Phase 13: Mockup Workflow
**Goal**: Users can hand image_task a brand mockup goal and get a plan that separates the scene generation (no text in the AI prompt) from the wordmark compositing (SVG placed via composite_layers), with the pattern documented for direct invocation
**Depends on**: Phase 12
**Requirements**: MOCK-01, MOCK-02
**Success Criteria** (what must be TRUE):
  1. Invoking image_task with a mockup goal produces a validated two-step plan: generate a clean scene image, then composite an SVG wordmark at caller-specified placement parameters
  2. The generate step's prompt contains no text or typography instructions (text fidelity is handled by the SVG layer, not the AI model)
  3. CLAUDE.md and AGENTS.md include a concrete mockup example showing the goal string, input_images reference for the SVG, and expected plan structure
**Plans**: 2 plans
- [x] 13-01-PLAN.md — Add `brand-mockup` template to `templates.ts` and unit test for match + prompt sanitization
- [x] 13-02-PLAN.md — Update CLAUDE.md and AGENTS.md with mockup pattern documentation and concrete example
**UI hint**: yes

### Phase 14: Batch Generation
**Goal**: Users can submit an array of generation requests as a single generate_batch call with one permission approval, per-item failure isolation, and a batch-scoped run artifact
**Depends on**: Phase 12
**Requirements**: BATCH-01, BATCH-02, BATCH-03, BATCH-04
**Success Criteria** (what must be TRUE):
  1. Calling generate_batch with an array of {prompt, outputPath} pairs triggers one MCP tool approval and produces all requested output files
  2. Specifying a provider on the batch applies that provider to every item without requiring per-item provider fields
  3. A single batch run ID groups all items; each item has its own trace entry and the batch has a single manifest
  4. If one item fails (invalid prompt, provider error), remaining items continue and complete; the batch manifest records the failure inline
**Plans**: TBD

### Phase 15: Style Anchoring
**Goal**: Users can pass a reference_image path to generate_image and generate_batch to anchor scene geometry and lighting across images; the call transparently routes through edit_prompt rather than raw generation
**Depends on**: Phase 14
**Requirements**: STYLE-01, STYLE-02, STYLE-03
**Success Criteria** (what must be TRUE):
  1. Passing reference_image to generate_image returns an output that visibly preserves the scene geometry and lighting from the reference while applying the new prompt content
  2. Passing reference_image to generate_batch applies the same reference anchor to every item in the batch
  3. When reference_image is set, the tool routes through edit_prompt (gpt-image-1.5) rather than the raw generation path, and this routing is visible in the returned trace
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Core Enhancements | v1.0 | 2/2 | Complete | 2026-01-30 |
| 2. Post-Processing | v1.0 | 2/2 | Complete | 2026-01-30 |
| 3. Asset Pipeline | v1.0 | 2/2 | Complete | 2026-01-30 |
| 4. Reference Images | v2.0 | 0/2 | Superseded | 2026-05-04 |
| 5. Capability Layer + image_op | v2.0 | 3/3 | Complete | 2026-05-01 |
| 6. Run/Session Artifact Layer | v2.0 | 2/2 | Complete | 2026-05-02 |
| 7. Eval Harness + Golden Set | v2.0 | 3/3 | Complete | 2026-05-02 |
| 8. Op Primitives Expansion | v2.0 | 2/2 | Complete | 2026-05-02 |
| 9. image_task Planner + DAG Executor | v2.0 | 4/4 | Complete | 2026-05-03 |
| 10. Template Fast-Paths + Parallelism | v2.0 | 2/2 | Complete | 2026-05-03 |
| 11. Provider Breadth (Post-Eval) | v2.0 | 3/3 | Complete | 2026-05-04 |
| 12. Routing Transparency | v2.1 | 3/3 | Complete   | 2026-05-11 |
| 13. Mockup Workflow | v2.1 | 2/2 | Complete   | 2026-05-11 |
| 14. Batch Generation | v2.1 | 2/2 | Complete   | 2026-05-11 |
| 15. Style Anchoring | v2.1 | 0/? | Not started | - |

## Archives

- Full v2.0 roadmap archive: `.planning/milestones/v2.0-ROADMAP.md`
- Full v2.0 requirements archive: `.planning/milestones/v2.0-REQUIREMENTS.md`
- v2.0 audit: `.planning/milestones/v2.0-MILESTONE-AUDIT.md`
