# Phase 12: Routing Transparency - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Autonomous — grey areas resolved by Zed + Matt

<domain>
## Phase Boundary

Register OpenAI, Gemini, Grok, Replicate, and Together AI as `(generate, provider)` capability rows in the capability registry, so `list_capabilities` surfaces them with cost/latency/quality metadata in the same schema as existing ops. The planner's existing routing logic (`quality.scores → cost → latency`) gains 5 new generate candidates automatically — no planner code changes needed.

This phase is routing transparency only. No eval scores are measured here; `allowUnscoredProduction` acknowledges the gap honestly and defers measurement.

</domain>

<decisions>
## Implementation Decisions

### File Structure
- One new capability file per provider: `openai-generate.ts`, `gemini-generate.ts`, `grok-generate.ts`, `replicate-generate.ts`, `together-generate.ts`
- Each is a thin adapter (~30-50 lines) that delegates to the existing v1 `ImageProvider` inside `invoke()` — reuses existing network/HTTP logic without exposing the v1 interface as part of the v2 contract
- Follows the `ideogram-generate.ts` one-file-per-cap convention so each file owns its provider's quirks (Grok prompt limit, OpenAI model selection, etc.)

### Cost / Latency Metadata (hardcoded public prices)
Use real approximate values to enable meaningful cost-based routing:
| Provider | perCallUsd | latencyMsP50 |
|---|---|---|
| together | 0.003 | 3000 |
| replicate | 0.004 | 6000 |
| grok | 0.02 | 5000 |
| gemini | 0.03 | 4000 |
| openai | 0.04 | 12000 |

Do NOT fudge cost to encode quality ordering — that is the job of `quality.scores` once evals run.

### allowUnscoredProduction
- All 5 new providers: `allowUnscoredProduction: true` with `unscoredJustification: "v1 text-to-image provider in production via generate_image; routing parity with v1 surface is a transparency gate, not a quality gate. Eval cases pending future milestone."`
- **Critical fix also in scope:** flip existing `createIdeogramGenerateCapability()` registration to also use `allowUnscoredProduction: true` — once a second unscored `generate` cap registers, the registry throws on Ideogram at startup without it

### Planner
- No planner code changes required — planner already snapshots `registry.list()` dynamically; new generate caps appear as routing candidates automatically
- Verify (read-only check): confirm `generate` is in `plan-schema.ts` op enum (expected yes, since Ideogram works), and that the planner's system prompt example doesn't hard-anchor on `"provider":"ideogram"`

### Grok Constraints
- `constraints.maxPromptLength: 1024` must be set AND enforced in `invoke()` — planner respects constraints but `image_op` callers bypass the planner

### Claude's Discretion
- Model version strings and exact endpoint shapes per provider — use the same values the v1 providers already use
- Latency values are approximate; mark with a comment: `// approximate — based on provider pricing page 2026-05`

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/capabilities/ideogram-generate.ts` — full reference pattern for factory shape, invoke contract, error handling, CapabilityInvokeError usage
- `src/providers/openai.ts`, `gemini.ts`, `grok.ts`, `replicate.ts`, `together.ts` — v1 providers to delegate to inside invoke()
- `src/capabilities/register.ts` — register all 5 here; follow existing conditional registration pattern

### Established Patterns
- Factory: `createXxxGenerateCapability(): Capability | null` — null when API key missing
- Error translation: `CapabilityInvokeError('TIMEOUT' | 'PROVIDER_FAILURE' | 'CONSTRAINT_VIOLATION', message, retryable)`
- Return shape: `{ kind: 'image', buffer: Buffer, model: string, metadata: Record<string, unknown> }`

### Integration Points
- `src/capabilities/register.ts` — one `capabilityRegistry.register(cap, { allowUnscoredProduction: true })` call per new provider
- `src/capabilities/ideogram-generate.ts` registration line — needs `allowUnscoredProduction: true` added
- Tests: add a registry integration test asserting `registerBuiltInCapabilities()` doesn't throw when all keys present; this guards against the cardinality constraint breaking future registrations

</code_context>

<specifics>
## Specific Ideas

- Add a registry smoke test: `registerBuiltInCapabilities()` must not throw when all env keys are present. Matt flagged this as cheap insurance against the multi-unscored-provider cardinality constraint being silently re-broken.
- Each capability file: include a `// Source: [provider] pricing page, 2026-05` comment on cost values so future maintainers know they're estimates, not measured data.

</specifics>

<deferred>
## Deferred Ideas

- Actual eval cases per provider (defer to future milestone per the unscoredJustification)
- Grok quality deprioritization via quality scores (correct approach) rather than cost fudging — defer to when evals run
- Per-item provider override in generate_batch (Phase 14 scope)

</deferred>
