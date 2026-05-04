# Phase 8: Op Primitives Expansion - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Add the remaining 6 capabilities to `CapabilityRegistry` so the Phase 9 planner has full op coverage:

- `composite_layers` — sharp, alpha-aware multi-layer composition
- `transform` — sharp, wraps existing `applyOperations()` from `src/utils/processing.ts`
- `enhance_upscale` — Replicate Real-ESRGAN
- `analyze_dimensions` — sharp metadata
- `analyze_palette` — sharp dominant-color extraction
- `analyze_ocr` — tesseract.js (already in repo from Phase 7 eval scoring)

In scope: capability registration, validation, sharp/Replicate/tesseract wiring, eval cases for the new caps, a one-time contract change to support data-returning capabilities, a minimal `list_capabilities` MCP tool so the Phase 9 planner can read cost/latency/quality.

Out of scope: the planner itself (Phase 9), the DAG executor (Phase 9), template fast-paths (Phase 10), additional providers (Phase 11), in-memory artifact passing between DAG nodes (Phase 9 if it becomes a real bottleneck).

</domain>

<decisions>
## Implementation Decisions

### Capability invoke contract (load-bearing — gates everything else)

- **D-01:** Replace `CapabilityInvokeResult` with a discriminated union on `kind`:
  ```ts
  type CapabilityInvokeResult =
    | { kind: 'image'; buffer: Buffer; model: string; revisedPrompt?: string; metadata?: Record<string, unknown> }
    | { kind: 'data';  data: AnalyzeDimensionsResult | AnalyzePaletteResult | AnalyzeOcrResult; model: string; metadata?: Record<string, unknown> };
  ```
- **D-02:** Tag inner result types with a `type` discriminant so TypeScript narrows correctly inside the `kind: 'data'` branch:
  ```ts
  interface AnalyzeDimensionsResult { type: 'dimensions'; width: number; height: number; format: string; channels: number; hasAlpha: boolean; }
  interface AnalyzePaletteResult    { type: 'palette';    colors: Array<{ hex: string; r: number; g: number; b: number; weight: number }>; }
  interface AnalyzeOcrResult        { type: 'ocr';        text: string; confidence: number; words?: Array<{ text: string; confidence: number; bbox: [number, number, number, number] }>; }
  ```
  Without the inner tag, `result.kind === 'data'` does not narrow `result.data` to a single member — the resulting `unknown` would force runtime `'text' in result.data` checks across `image_op` and the Phase 9 planner.
- **D-03:** `metadata` is for **invocation telemetry only** (input path, model params, timing, prediction IDs). Structured results live in `data`. Enforced by JSDoc on the type definition; no result-shape data may appear in `metadata`.
- **D-04:** Codemod the two existing capabilities (`extract-subject.ts`, `edit-prompt.ts`) to add `kind: 'image'` explicitly. Do not add a registry-level adapter that defaults `kind` — explicit is safer.
- **D-05:** `image_op` switch on `kind`:
  - `'image'` → save buffer to `outputPath`/`outputDir` (current behavior), respond `{ output, runId, trace }`.
  - `'data'` → ignore `outputPath`/`outputDir` entirely, respond `{ data, runId, trace }`. No JSON sidecar files. Trace `artifactPath` is `null` for data nodes.
- **D-06:** `AnalyzeDimensionsResult`, `AnalyzePaletteResult`, `AnalyzeOcrResult` are **public contract** from day one. Changing these shapes is a breaking change to any persisted Phase 9 plan. Treat as stable.

### Structured errors

- **D-07:** Add a `CapabilityInvokeError` class in 08-01:
  ```ts
  class CapabilityInvokeError extends Error {
    constructor(
      public code: 'INPUT_TOO_LARGE' | 'CONSTRAINT_VIOLATION' | 'PROVIDER_FAILURE' | 'TIMEOUT' | 'UNSUPPORTED',
      message: string,
      public retryable: boolean,
      public suggestion?: string
    ) { super(message); this.name = 'CapabilityInvokeError'; }
  }
  ```
  All Phase 8 caps throw this type for actionable failures. Phase 9's planner needs structured failures (`code`, `retryable`, `suggestion`) for retry logic. Without this, every cap gets rewritten in Phase 9.

### Forward-compatible parameter fields

- **D-08:** Reserve `idempotencyKey?: string` on `CapabilityInvokeParams` now, even though Phase 8 doesn't consume it. Prevents a contract break in Phase 9 when DAG retries land. No code reads it yet; just the field on the type.

### Quality / unscored gate

- **D-09:** When a capability registers with `allowUnscoredProduction: true`, require a non-empty `quality.unscoredJustification?: string` on the capability. Audit trail. Without it, after 4 caps use this flag we won't remember which were intentionally unscored vs. forgotten.

### `transform` capability

- **D-10:** `transform` is a thin shim over `applyOperations(buffer, ProcessingOperation[])` from `src/utils/processing.ts`. No new operation types — the v1.0 `process_image` MCP tool and the new capability share the same implementation. Bug fixes propagate automatically.
- **D-11:** Move (or re-export) `ProcessingOperation` so it has a single canonical home reachable from `src/capabilities/`. Pick one: re-export from `src/capabilities/types.ts`, or move the type itself. No duplicate declarations.
- **D-12:** Cap operation chain length at 16 (`maxOps: 16`) at the capability boundary, not inside `applyOperations` (keep the utility unopinionated). Throws `CapabilityInvokeError({ code: 'CONSTRAINT_VIOLATION', retryable: false })` on overflow. Real DoS vector if a planner emits a 50-step chain.
- **D-13:** Pipe `originalInfo`, `outputInfo`, `operationsApplied` from `ProcessingResult` into the capability's `metadata` for free observability. Three-line addition.

### `composite_layers` capability

- **D-14:** Param schema:
  ```ts
  {
    canvas: {
      width: number;                                          // required
      height: number;                                         // required
      background?: string | { r: number; g: number; b: number; alpha: number };  // matches sharp's API
    };
    layers: Array<{
      input: string;                                          // file path
      x?: number;                                             // default 0
      y?: number;                                             // default 0
      scale?: number;                                         // default 1.0, range 0.05-10
      opacity?: number;                                       // 0-1, default 1.0
      anchor?: 'top-left' | 'center' | 'top-right' | 'bottom-left' | 'bottom-right';  // default 'top-left'
    }>
  }
  ```
- **D-15:** z-order = array order (first item = bottom layer). Standard convention; no explicit z field.
- **D-16:** `(x, y)` semantics: "the canvas position where the layer's anchor point is placed." Default `anchor: 'top-left'` so undefined behaves like `(0, 0)` from the corner. Document this exactly in the tool description so the Phase 9 planner cannot guess differently between runs.
- **D-17:** Hard caps (all reject with `CapabilityInvokeError({ code: 'INPUT_TOO_LARGE' or 'CONSTRAINT_VIOLATION' })` before sharp work):
  - `layers.length` ≤ 16
  - `scale` ∈ [0.05, 10]
  - `canvas.width × canvas.height` ≤ 16 megapixels (consistent with `enhance_upscale` cap)
- **D-18:** Implement as a single `sharp(canvas).composite([...])` call (sharp accepts an array). Do **not** chain N sequential composites — chaining serializes through the libvips concurrency cap of 2 and looks pathologically slow under the Phase 9 parallel DAG.
- **D-19:** Skip rotation and blend modes for v1. Sharp supports both; add later when there's a real use case. Optional fields on a future capability version, not v1 schema.

### `enhance_upscale` capability

- **D-20:** Provider model: `nightmareai/real-esrgan` on Replicate. Most popular fork, stable, supports 2x and 4x.
- **D-21:** Default `scale: 2`. User must explicitly pass `scale: 4` to opt into 4x.
- **D-22:** Default `face_enhance: false`. Real-ESRGAN's face_enhance hallucinates faces on logos, products, and text-heavy inputs. Expose as a param the planner can opt into.
- **D-23:** Hard cap on **both** input and output:
  - Input ≤ 4 megapixels (reject before Replicate API call)
  - Output (input × scale²) ≤ 16 megapixels
  - Both errors are `CapabilityInvokeError({ code: 'INPUT_TOO_LARGE', retryable: false, suggestion: 'reduce scale or downscale input' })`.
- **D-24:** Replicate URL fetch is its own failure surface. Wrap with 30s timeout + 1 retry. Surface `predictionId` in `metadata` for cost reconciliation.
- **D-25:** Use `cost.perMegapixelUsd` (already on `CapabilityCost` type), not `cost.perCallUsd` — Real-ESRGAN price scales with output megapixels and the planner needs the right shape to estimate cost.
- **D-26:** Register with `allowUnscoredProduction: true` and `quality.unscoredJustification: "no deterministic scorer exists for upscaling — would require LPIPS or human eval, neither in Phase 7 scope"`. A future eval phase can add a perceptual scorer without re-registering.

### `analyze_dimensions` / `analyze_palette` / `analyze_ocr`

- **D-27:** All three return `kind: 'data'` results with the typed shapes in D-02. No file save. No `outputPath` consumption.
- **D-28:** `analyze_dimensions`: trivial sharp metadata read. Returns `{ type: 'dimensions', width, height, format, channels, hasAlpha }`.
- **D-29:** `analyze_palette`: sharp dominant-color extraction. Default 5 colors, configurable via `params.count` (clamped 1–16). Returns colors sorted by `weight` descending.
- **D-30:** `analyze_ocr`: tesseract.js. Default `lang: 'eng'`, configurable. Returns `{ type: 'ocr', text, confidence, words? }` where `words` is included when `params.includeWords === true`.

### Shared OCR worker

- **D-31:** Extract `createOcrWorker()` from `src/eval/scorers.ts:scoreOcrTextPresence` (currently lines 76-105 — creates and terminates a worker per call) into `src/utils/ocr.ts`.
- **D-32:** The shared util exposes both:
  - **Per-call mode** (eval scoring): create worker → run → terminate. Existing eval behavior preserved.
  - **Pooled mode** (capability invocation): one cached worker per language, reused across calls. Without pooling, `analyze_ocr` over 20 generated images = ~30s of redundant tesseract init.
- **D-33:** Both `src/eval/scorers.ts` (existing) and `src/capabilities/analyze-ocr.ts` (new) import from `src/utils/ocr.ts`. One source of truth for the tesseract wrapper.

### `list_capabilities` MCP tool

- **D-34:** Add a minimal new MCP tool `list_capabilities` in 08-01. Returns the registry contents minus the `invoke` function:
  ```ts
  Array<{ op, provider, modelVersion, constraints, cost, latencyMsP50?, quality? }>
  ```
- **D-35:** Reason it lands in Phase 8 not Phase 9: the Phase 9 Haiku planner has no other way to read `cost.perCallUsd`, `cost.perMegapixelUsd`, `latencyMsP50`, or `quality.scores`. Without `list_capabilities`, Phase 9 ships cost-blind and the planner picks `enhance_upscale` for things that don't need upscaling. Three-line MCP tool registration; cheap insurance.

### `CapabilityOp` enum hygiene

- **D-36:** Drop unused `'generate'` from the `CapabilityOp` union in `src/capabilities/types.ts` for Phase 8. No registered capability uses it; `generate_image` lives in its own MCP tool. Phase 11 will re-add when a provider registers `generate` as a routable capability.
- **D-37:** Document the policy in CONTEXT.md/decisions: enum entries land **only when at least one capability registers**; removal is a breaking change to any persisted Phase 9 plans. (No persisted plans exist yet, so dropping `generate` now is safe.)

### Eval coverage for new capabilities

- **D-38:** Eval cases:
  - `analyze_dimensions` / `analyze_palette` / `analyze_ocr` — deterministic exact-match scorers; trivial fixtures (an image with known dims, a known palette, an image with known text).
  - `composite_layers` — pixelmatch against a golden composite for one fixed-input case. One fixture.
  - `transform` — already covered indirectly by v1.0 `processing.ts` tests; skip a dedicated capability eval case.
  - `enhance_upscale` — unscored, see D-26.
- **D-39:** Eval cases land in 08-02 alongside the capabilities they cover.

### Plan split

- **D-40:** Two plans, not three. The contract change in 08-01 is the only sequencing dependency; everything in 08-02 is internally independent.
  - **08-01:** Contract (discriminated union with tagged inner types, `CapabilityInvokeError`, `idempotencyKey?`, `unscoredJustification?`), codemod existing 2 caps, `transform` shim, `analyze_dimensions`, `analyze_palette`, `list_capabilities` MCP tool, `ProcessingOperation` type rehoming, drop unused `generate` enum entry, eval cases for the analyze ops landed in 08-01.
  - **08-02:** `composite_layers` (with all caps + sharp single-call composition), `enhance_upscale` (with timeout/retry/cost surfacing), `analyze_ocr`, extract pooled OCR worker to `src/utils/ocr.ts`, eval case for `composite_layers`.

### Concurrency / sharp concurrency cap

- **D-41:** Phase 8 does **not** solve per-backend concurrency (sharp vs tesseract vs Replicate). Phase 9's DAG executor owns that. Mention in the 08-02 plan as a Phase 9 follow-up so it isn't lost: the libvips=2 cap doesn't help Replicate or tesseract throughput; Phase 9 needs a concurrency budget per backend.

### Claude's Discretion

- File layout under `src/capabilities/` for the 6 new caps (one file per cap, mirroring `extract-subject.ts` / `edit-prompt.ts` pattern, unless the planner finds a better grouping).
- Exact Zod schemas for each cap's params (drive from the typed contracts above).
- Test naming/structure under Vitest 2.x (mirror Phase 6/7 conventions in `src/eval/__tests__/` and `src/capabilities/__tests__/` if they exist; otherwise pick a consistent pattern).
- Whether `list_capabilities` filters out invoke-only fields by exclusion or by an explicit serializer (functionally equivalent; pick the cleaner one).
- Real-ESRGAN-specific Replicate input parameter wiring (`tile`, `tile_pad`, `pre_pad`, etc.) — read the model schema and use sensible defaults; expose only `scale` and `face_enhance` to the capability surface.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §"Phase 8: Op Primitives Expansion" — phase goal, success criteria, depends-on
- `.planning/REQUIREMENTS.md` §"Op Primitives (PRIM)" — PRIM-03..PRIM-08 specs
- `.planning/PROJECT.md` §"Key Decisions" — v2.0 architectural locks (capability registry parallel to ImageProvider, plain string provider names, eval gate for second providers)
- `.planning/STATE.md` §"Decisions" — Phase 5/6/7 locks that flow into Phase 8

### Capability layer (existing, must not break)
- `src/capabilities/types.ts` — `Capability`, `CapabilityInvokeResult`, `CapabilityCost`, `CapabilityQuality`, `CapabilityRegistrationOptions`, `CapabilityOp` enum (this file is the contract surface modified by 08-01)
- `src/capabilities/registry.ts` — Map-based registry with unscored-production gate (Phase 7)
- `src/capabilities/register.ts` — `registerBuiltInCapabilities()` — extend here for the 6 new caps
- `src/capabilities/extract-subject.ts` — capability shape reference (image-returning); will be codemodded for `kind: 'image'`
- `src/capabilities/edit-prompt.ts` — capability shape reference (image-returning, with API key check); will be codemodded for `kind: 'image'`
- `src/capabilities/validation.ts` — pre-invocation validation pattern; extend for new caps' constraints

### Processing / sharp utilities (reused, must not duplicate)
- `src/utils/processing.ts` — `applyOperations(buffer, ProcessingOperation[])`, `ProcessingOperation` tagged union (resize/crop/aspectCrop/circleMask). The `transform` capability is a shim over this; do not re-implement.
- `src/utils/image.ts` — `getOutputDir()`, `saveImage()`, `resolveOutputPath()` — used by `image_op`'s save path for `kind: 'image'` results

### MCP tool surface
- `src/index.ts` — MCP server entry, tool registration. Add `list_capabilities` tool here in 08-01. The `image_op` handler branches on `kind` per D-05.

### Eval (existing, will be partially rehomed)
- `src/eval/scorers.ts` lines 64-105 (`scoreOcrTextPresence`) — current tesseract.js wrapper to extract per D-31; uses `tesseract.js` `createWorker('eng')` per call
- `src/eval/run.ts` — eval harness entry; new caps land cases in `eval/cases/` and run through this harness
- `src/eval/apply-results.ts` — populates `quality.scores`; `enhance_upscale` will be unscored per D-26
- `eval/cases/`, `eval/fixtures/`, `eval/results/` — directory layout for new eval cases

### Run/session artifacts (Phase 6 — must integrate)
- `.runs/<runId>/n<nodeId>.png` — intermediate artifact convention. `kind: 'image'` results write here; `kind: 'data'` results do **not** (D-05). Trace `artifactPath: null` for data nodes.

### v1.0 surface (must not break)
- `src/utils/presets.ts` — `ASSET_PRESETS` (referenced by `process_image` and Phase 10's template fast-paths; not modified by Phase 8)
- v1.0 MCP tools (`generate_image`, `process_image`, `generate_asset`) remain unchanged

### External docs (read for implementation)
- sharp `composite()` API docs (Context7: `mcp__plugin_context7_context7__query-docs` for `sharp`) — for `composite_layers` and the canvas+layers structure
- Replicate model: `nightmareai/real-esrgan` schema — for `enhance_upscale` input shape (`scale`, `face_enhance`, optional `tile`/`tile_pad`/`pre_pad`)
- tesseract.js worker API — for pooled-mode lifecycle in `src/utils/ocr.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/utils/processing.ts:applyOperations`** — entire `transform` capability is a ~10-line shim over this. `ProcessingOperation` tagged union is already the right shape for an LLM-emitted plan.
- **`src/utils/image.ts:saveImage`/`resolveOutputPath`** — `image_op` already uses these for `kind: 'image'` results; no change needed.
- **`src/eval/scorers.ts:scoreOcrTextPresence`** (lines 64-105) — tesseract.js + `createWorker('eng')` wrapper already in repo from Phase 7. Extract worker creation per D-31 so `analyze_ocr` and the eval scorer share lifecycle.
- **`src/capabilities/registry.ts` unscored gate** — already enforces "second provider per op requires measured score unless `allowUnscoredProduction: true`" from Phase 7. `enhance_upscale` rides this path.
- **`src/capabilities/extract-subject.ts` / `edit-prompt.ts`** — capability shape templates. New capability files mirror their structure (factory function, optional null return on missing API key, typed constraints).

### Established Patterns
- **Provider self-registration with graceful nulls** — capabilities that need API keys (`enhance_upscale` needs `REPLICATE_API_TOKEN`) return `null` from their factory if the env var is absent. `register.ts` filters nulls.
- **Tagged union for operation types** — `ProcessingOperation` discriminated on `type` field. This same pattern goes into the new `AnalyzeXResult` types (D-02) so TS narrows correctly.
- **Atomic writes (tmp + rename)** — Phase 6 convention for run artifacts. `kind: 'image'` capability outputs land here; nothing new needed for Phase 8.
- **Constraint validation before provider call** — `src/capabilities/validation.ts` runs pre-invocation. Extend with the per-cap caps from D-12, D-17, D-23.
- **`OPENAI_EDIT_MODEL` env var pattern** with `${...}` placeholder defense — established in `edit-prompt.ts` (`resolveOptionalEnv`). Reuse for any new env var Phase 8 introduces.
- **Vitest 2.x for tests** — Phase 6 locked the framework. No `tsconfig` change needed.

### Integration Points
- **`src/index.ts` tool handler** — `image_op`'s response branches on the new `kind` per D-05. Add `list_capabilities` tool registration here.
- **`src/capabilities/register.ts:registerBuiltInCapabilities()`** — central registration; six new factory imports land here.
- **`src/capabilities/types.ts`** — the shared contract surface; the discriminated union and `CapabilityInvokeError` class live here so all capabilities import the same definitions.
- **`src/eval/run.ts`** — new eval cases register through the existing harness; results flow through `apply-results.ts` to populate `quality.scores`.
- **`.runs/<runId>/` retention sweep** — Phase 6 startup sweep already handles this; data-only capability calls produce no artifacts so they don't affect retention math.

</code_context>

<specifics>
## Specific Ideas

- Two adversarial reviews were run during context-gathering (zed-velocity-engineer + general-purpose senior-staff lens). Their pushbacks shaped D-01..D-05 (discriminated union with tagged inner types vs. naïve `buffer? | data?`), D-07 (structured error class), D-09 (`unscoredJustification`), D-12 (`maxOps`), D-14..D-19 (composite caps + sharp single-call), D-22..D-25 (face_enhance default off, input MP cap, Replicate fetch hardening, `perMegapixelUsd`), D-31..D-33 (OCR worker pooling), D-34..D-35 (`list_capabilities` MCP tool to unblock Phase 9 cost-aware planning), D-36..D-37 (drop unused enum entry + policy), D-40 (2 plans not 3).

- The user's stated priority: get the contract right *now* so Phase 9 doesn't require a rewrite of every capability. Optimize for "Phase 9-proof" over "minimum Phase 8 surface."

- Real-ESRGAN model identity is **`nightmareai/real-esrgan`** specifically (not `philz1337x/clarity-upscaler` — too pricey for default; not `lucataco/real-esrgan` — equivalent to nightmareai but less battle-tested).

</specifics>

<deferred>
## Deferred Ideas

- **Rotation and arbitrary blend modes on `composite_layers`** — sharp supports both. Add when there's a real use case; the schema is forward-compatible (optional fields on a future cap version).
- **Layer `input` accepting Buffer instead of just file paths** — would let Phase 9 chain capabilities without round-tripping through disk between every node. But trace contract says paths-only; defer until Phase 9 measures whether disk I/O is actually the bottleneck.
- **Per-backend concurrency budgets** (sharp vs tesseract vs Replicate) — the libvips=2 cap doesn't help Replicate or tesseract. Phase 9's DAG executor owns this. Note in 08-02.
- **SSIM bicubic-roundtrip "sanity" scorer for upscale** — catches "model returned garbage" without measuring quality. Defer to a future eval phase; Phase 8 ships unscored per D-26.
- **`traceId` on `CapabilityInvokeParams`** — Phase 6 already has `runId`/`nodeId` in manifests. Add when there's an actual logging consumer; not needed for Phase 8.
- **Wiring `generate` as a capability** — Phase 11 territory when providers start registering it as a routable cap. For now, keep `generate_image` MCP tool unchanged.
- **Pooled OCR worker eviction policy** — for Phase 8, one cached worker per language indefinitely. If long-running servers need eviction, add later.
- **Multiple OCR languages in one call** — current scope: one language per invocation. Multi-language ranking deferred.
- **Pre-multiplied alpha edge cases on composite** — sharp handles this internally; surface a knob if the planner needs it. Defer.

</deferred>

---

*Phase: 8-op-primitives-expansion*
*Context gathered: 2026-05-02*
