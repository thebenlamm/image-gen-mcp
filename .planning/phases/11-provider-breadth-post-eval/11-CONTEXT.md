# Phase 11: Provider Breadth (Post-Eval) - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Photoroom, fal.ai, Flux Kontext, and Ideogram as capability-routed providers where they measurably outperform or materially complement existing routes. This phase expands provider breadth through the `CapabilityRegistry`, eval evidence, and `image_task` routing behavior.

In scope: provider capability adapters, API-key-gated registration, eval cases and score application for new providers, `generate` re-entry into the capability layer for Ideogram, planner-visible routing metadata, and trace-visible routing decisions.

Out of scope: adding these providers to the v1 `generate_image` `ImageProvider` surface, building a full subjective/human eval workflow, changing v1 primitives, silent provider fallback, cross-run cost dashboards, or general provider marketplace abstractions.

</domain>

<decisions>
## Implementation Decisions

### Provider shape
- **D-01:** Keep Phase 11 capability-first. New providers should register through `CapabilityRegistry`, not by expanding the v1 `ImageProvider` surface unless a later phase explicitly asks for that.
- **D-02:** Re-add `generate` to `CapabilityOp` only when Ideogram registers a real `generate` capability. This follows the Phase 8 enum policy: capability ops exist only when at least one provider registers them.
- **D-03:** Ideogram should be implemented as a `generate` capability for `image_task` / `image_op`, not as `generate_image(provider: "ideogram")` in Phase 11.
- **D-04:** Photoroom should be capability-only. Treat it as a specialized product/image editing provider for `extract_subject` and product-photography composition behavior, not as a general generator.
- **D-05:** fal.ai should be a capability/platform adapter with specific model-backed capabilities and explicit `modelVersion` values, not a broad v1 provider abstraction.
- **D-06:** Flux Kontext should register as `edit_prompt` for no-mask instruction edits. Prefer the best current Kontext-compatible endpoint during implementation, but preserve the roadmap intent: instruction edit routing based on measured edit quality.

### Routing gates
- **D-07:** Allow direct `image_op` use once a provider adapter is registered, API keys are present, and capability validation passes. This is the exploration and debugging path.
- **D-08:** Do not let `image_task` prefer a new provider until relevant eval scores exist. Unmeasured providers may appear in registry/tooling, but planner preference must be earned through evidence.
- **D-09:** New providers can be trace-visible as available-but-unmeasured, but the planner should not silently treat them as "best" without relevant scores.
- **D-10:** For second-provider routing, require a meaningful edge before displacing an incumbent: roughly an absolute `>= 0.03` quality-score improvement for comparable quality metrics, or `>= 20%` latency/cost improvement for `quality_tier: "fast"` routing when quality is above the acceptable floor.
- **D-11:** If a provider is the only registered provider for a capability, it may route once validated, but trace output must make clear there is no incumbent comparison.
- **D-12:** Do not loosen the existing unscored-production gate for Phase 11. The eval harness is the reason this phase exists.

### Eval strategy
- **D-13:** Keep Phase 11 evals small and hard-nosed. Each eval case must answer a routing question, not merely prove an API call works.
- **D-14:** Deterministic/programmatic metrics are the planner gate. Persist comparable output artifacts so human inspection is easy, but do not build a full subjective preference workflow in this phase.
- **D-15:** Photoroom product evals should measure product/subject preservation, alpha edge quality, and shadow/background quality where the Image Editing API is used.
- **D-16:** fal.ai mirror evals should compare against an existing Replicate-class route on the same fixture and params. fal.ai should win `fast` only when it maintains acceptable quality and materially improves latency or cost.
- **D-17:** Flux Kontext evals should score instruction success and subject preservation separately. Use machine-checkable edits where possible: object color changes, visible object additions/removals, or text edits that OCR can verify.
- **D-18:** Ideogram evals should focus on text-heavy generation. Use OCR-backed exact/normalized text match, word order, and legibility-oriented scoring. Ideogram should route for text-heavy goals only if this score beats incumbent generation routes.
- **D-19:** Avoid broad human-only visual quality gates in Phase 11. If a provider needs subjective proof, expose it for `image_op` experiments and capture artifacts, but do not make it a planner favorite yet.

### Route preferences
- **D-20:** `quality_tier` should bias routing; the goal determines which score matters. Do not route on a single generic provider score when a goal-specific metric is available.
- **D-21:** For `quality_tier: "best"`, choose the highest relevant measured quality within hard budget and latency caps, even if slower or more expensive.
- **D-22:** For `quality_tier: "fast"`, require a minimum acceptable quality floor, then choose lowest latency; cost is the tiebreaker.
- **D-23:** For `quality_tier: "balanced"`, require measured quality and use a weighted decision that considers relevant quality first, then cost, then latency.
- **D-24:** Goal-specific metrics beat generic metrics: text-heavy goals use text fidelity; product goals use subject/shadow/background preservation; edit goals use instruction success plus preservation.
- **D-25:** If quality scores are missing for all legal providers, the planner may route on cost/latency only, but trace must explicitly state quality was unavailable.

### Trace and planner behavior
- **D-26:** Route decisions for new providers must be visible in trace: selected provider, model version, relevant score(s), cost/latency assumptions, and whether quality was measured or unavailable.
- **D-27:** No silent fallback. If the chosen provider fails, return a structured failure in trace rather than switching providers invisibly.
- **D-28:** Templates must continue to validate against the registry before execution. Adding Photoroom or fal.ai should not bypass Phase 10 template validation behavior.

### the agent's Discretion
- Exact module layout for Photoroom, fal.ai, Flux Kontext, and Ideogram adapters.
- Exact score field names, provided each score maps clearly to a routing question and is documented in eval cases.
- Exact provider environment variable names, provided missing keys gracefully disable provider registration and README/config docs are updated.
- Whether Flux Kontext is reached through fal.ai or BFL direct, provided the selected adapter satisfies the Phase 11 `edit_prompt` intent and records clear `provider` / `modelVersion` metadata.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 11: Provider Breadth (Post-Eval)" — phase goal, dependencies, success criteria, and plan count.
- `.planning/REQUIREMENTS.md` §"Provider Breadth (PROV) — Post-Eval" — PROV-01..PROV-05.
- `.planning/PROJECT.md` §"Key Decisions" — capability registry parallel to `ImageProvider`, plain string provider names, measured-quality routing, path-only traces, and v1/v2 value split.
- `.planning/STATE.md` §"Decisions" and "Blockers/Concerns" — accumulated locks and the eval gate for Phase 11.

### Prior phase context
- `.planning/phases/09-image-task-planner-dag-executor/09-CONTEXT.md` — strict plan schema, registry-backed validation, quality-aware routing, trace behavior, and no new providers in Phase 9.
- `.planning/phases/08-op-primitives-expansion/08-CONTEXT.md` — capability result union, structured errors, unscored-production gate, `list_capabilities`, and `generate` op enum policy.
- `.planning/phases/01-core-enhancements/01-CONTEXT.md` — no silent fallback and clear provider error behavior.

### Capability and routing code
- `src/capabilities/types.ts` — `CapabilityOp`, capability metadata, quality scores, cost metadata, invoke result union, and structured capability errors.
- `src/capabilities/registry.ts` — registry lookup/list behavior, model-version score invalidation, and unscored-production gate.
- `src/capabilities/register.ts` — built-in capability registration point to extend for new providers.
- `src/capabilities/validation.ts` — shared pre-invocation validation pattern.
- `src/task/planner.ts` — capability snapshot and routing prompt policy consumed by Haiku planner.
- `src/task/plan-validator.ts` — validates capability existence, refs, params, costs, and constraints before execution.
- `src/task/templates.ts` — template fast-path registry validation that must continue working with more providers.
- `src/task/dag-executor.ts` — provider invocation, node trace, failure/skip behavior, and artifact handling.
- `src/index.ts` — `image_op`, `image_task`, and `list_capabilities` MCP tool surfaces.

### Eval harness
- `src/eval/run.ts` — eval execution path that invokes capabilities and records results.
- `src/eval/apply-results.ts` — score population into registry capabilities.
- `src/eval/cases.ts` and `eval/cases/` — eval case schema and case definitions to extend for new providers.
- `eval/fixtures/manifest.json` and `eval/fixtures/` — existing fixture set to reuse for product, text, and edit cases.
- `src/eval/scorers.ts` — existing deterministic scoring utilities and OCR scoring patterns.

### External implementation docs
- Photoroom API docs — background removal, image editing, shadows, relighting, output format, API-key auth, and billing distinction between Remove Background and Image Editing APIs.
- fal.ai Flux Kontext docs — endpoint shape, queue/subscribe behavior, image URL input/output, model IDs, output format, and latency/cost metadata source.
- BFL Flux Kontext docs — current guidance for Kontext-family editing capabilities and whether FLUX.1 Kontext or a newer endpoint is the right implementation target.
- Ideogram Developer API docs — Ideogram 3.0 generation endpoint, transparent-background generation, rendering speed, aspect ratio/resolution, Magic Prompt, seed, and ephemeral URL download behavior.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/capabilities/register.ts` — current single registration point for built-in capabilities; new provider factories should be added here with graceful nulls for missing API keys.
- `src/capabilities/registry.ts` — already enforces score invalidation on model-version changes and blocks unscored second providers unless explicitly allowed.
- `src/task/planner.ts` — already passes provider, modelVersion, constraints, cost, latency, and quality scores to the planner.
- `src/task/plan-validator.ts` — already rejects unregistered `(op, provider)` pairs and validates refs before execution.
- `src/eval/apply-results.ts` — already applies persisted eval result scores to matching `(op, provider, modelVersion)` capabilities.
- `src/utils/image.ts` and `src/runs/write.ts` — existing download/save/atomic write patterns for provider URL results and run artifacts.

### Established Patterns
- Provider/capability registration is API-key gated and gracefully skipped when credentials are absent.
- Capability provider names are plain strings; v1 `ProviderName` remains a closed union for legacy tools.
- Quality scores are undefined until eval results populate them; model-version drift invalidates prior scores.
- `image_task` route choice is validated in code, not trusted from the planner.
- MCP responses stay compact and path-only; rich details belong in trace/manifest artifacts.
- Existing v1 tools remain predictable and are not deprecated by v2 capability routing.

### Integration Points
- Add provider-specific capability files under `src/capabilities/` or a small provider subfolder if shared client code justifies it.
- Extend `CapabilityOp` with `generate` for Ideogram when the Ideogram capability lands.
- Extend `PlanSchema` / validator output-kind mapping if `generate` is reintroduced as an image-producing capability.
- Add eval cases under `eval/cases/` and fixtures only when existing fixtures are insufficient.
- Update README provider/capability docs and env-var table with `PHOTOROOM_API_KEY`, `FAL_KEY` or chosen fal env var, BFL direct key if used, and `IDEOGRAM_API_KEY` as applicable.
- Ensure route traces include selected metric names and measured/unmeasured status for new provider decisions.

</code_context>

<specifics>
## Specific Ideas

- The final locked direction is a two-tier provider policy: direct `image_op` can explore newly registered providers, while planner-preferred `image_task` routing requires relevant eval evidence.
- The system should not become too conservative to try new providers, but it also should not weaken the measured-routing promise that Phase 7 made possible.
- Ideogram's role is narrow at first: text-heavy generation if OCR-backed evals prove it beats incumbents.
- Photoroom's role is narrow at first: product-photo workflows where product preservation, alpha quality, shadow/background polish, or relighting provide measurable value.
- fal.ai's role is narrow at first: faster/cheaper mirrors for Replicate-class routes, not automatic best-quality replacement.
- Flux Kontext's role is narrow at first: no-mask instruction edits when instruction success plus subject preservation beats OpenAI edit routing.

</specifics>

<deferred>
## Deferred Ideas

- Add Ideogram to the v1 `generate_image(provider: "ideogram")` surface if capability usage proves it is broadly useful.
- Build a human/preference eval workflow for perceptual quality after Phase 11 if deterministic metrics are insufficient.
- Generalize fal.ai into a broader provider platform abstraction if more fal models become first-class routes.
- Add richer subjective image-quality metrics or pairwise ranking beyond the small deterministic eval gates.

</deferred>

---

*Phase: 11-provider-breadth-post-eval*
*Context gathered: 2026-05-03*
