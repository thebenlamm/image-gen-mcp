# Requirements: Image-Gen MCP v2.1

**Defined:** 2026-05-11
**Milestone:** v2.1 Brand Workflow Improvements
**Core Value:** Two value props, one MCP — guaranteed primitives and flexible goal handoff.

## v2.1 Requirements

### Batch Generation (BATCH)

- [ ] **BATCH-01:** User can submit an array of `{prompt, outputPath}` pairs as a single `generate_batch` call with one permission approval for the batch
- [ ] **BATCH-02:** User can specify a provider for the entire batch
- [ ] **BATCH-03:** `generate_batch` produces a batch-scoped run artifact with a single batch run ID, per-item traces, and a batch manifest
- [ ] **BATCH-04:** A single item failure does not abort the remaining items in the batch

### Routing Transparency (ROUTE)

- [ ] **ROUTE-01:** User can see OpenAI, Gemini, Grok, Replicate, and Together AI as `(generate, provider)` capability rows in `list_capabilities` output
- [ ] **ROUTE-02:** Each `generate` capability row includes `cost`, `latencyMsP50`, `quality`, and `constraints` fields matching the existing op schema
- [ ] **ROUTE-03:** `image_task` planner can route `generate` ops using `quality.scores` from registered generate capabilities

### Mockup Workflow (MOCK)

- [ ] **MOCK-01:** User can invoke `image_task` with a brand mockup goal and get a plan that generates a scene image (no text in the generation prompt) then composites an SVG wordmark at specified placement parameters
- [ ] **MOCK-02:** The two-stage generate → composite pattern is documented in CLAUDE.md and AGENTS.md with a concrete example

### Style Anchoring (STYLE)

- [ ] **STYLE-01:** User can pass a `reference_image` path to `generate_image` to anchor scene geometry and lighting while varying content via prompt
- [ ] **STYLE-02:** User can pass `reference_image` to `generate_batch` to anchor style across all items in a batch
- [ ] **STYLE-03:** When `reference_image` is provided, the call routes through `edit_prompt` (gpt-image-1.5) rather than raw generation

## Future Requirements

### Batch
- **BATCH-F01:** Per-item provider override within a batch
- **BATCH-F02:** Style seed / numeric seed parameter for deterministic reproducibility

### Output
- **OUT-F01:** JPEG/WebP output format options alongside PNG

## Out of Scope

| Feature | Reason |
|---------|--------|
| Async cloud batch jobs / job queues | Synchronous batch with per-item traces only; personal tool doesn't need async infrastructure |
| UI for batch management | MCP tool surface only |
| generate_batch for non-generate ops | image_task handles multi-op sequencing; batch is generation-specific |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ROUTE-01 | Phase 12 | Complete |
| ROUTE-02 | Phase 12 | Complete |
| ROUTE-03 | Phase 12 | Complete |
| MOCK-01 | Phase 13 | Complete |
| MOCK-02 | Phase 13 | Complete |
| BATCH-01 | Phase 14 | Complete |
| BATCH-02 | Phase 14 | Complete |
| BATCH-03 | Phase 14 | Complete |
| BATCH-04 | Phase 14 | Complete |
| STYLE-01 | Phase 15 | Complete |
| STYLE-02 | Phase 15 | Complete |
| STYLE-03 | Phase 15 | Complete |

**Coverage:**
- v2.1 requirements: 12 total
- Mapped to phases: 12 (100%)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-11*
*Last updated: 2026-05-11 — traceability filled after roadmap creation*
