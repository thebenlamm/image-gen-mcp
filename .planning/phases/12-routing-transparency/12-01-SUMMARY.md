---
phase: 12-routing-transparency
plan: "01"
subsystem: capabilities
tags: [capabilities, generate, openai, gemini, together, v2, routing]
dependency_graph:
  requires: []
  provides:
    - createOpenAIGenerateCapability
    - createGeminiGenerateCapability
    - createTogetherGenerateCapability
  affects:
    - src/capabilities/register.ts (Plan 12-03 will register these)
tech_stack:
  added: []
  patterns:
    - v1-provider-delegation: capability invoke() wraps v1 ImageProvider.generate()
    - null-factory: factory returns null when API key absent
    - error-translation: provider exceptions wrapped as CapabilityInvokeError(PROVIDER_FAILURE)
key_files:
  created:
    - src/capabilities/openai-generate.ts
    - src/capabilities/gemini-generate.ts
    - src/capabilities/together-generate.ts
  modified: []
decisions:
  - "omit revisedPrompt from Gemini and Together return shapes (providers don't return one)"
  - "modelVersion reads provider.defaultModel at factory-call time (honors env var overrides for OpenAI)"
metrics:
  duration: ~10 minutes
  completed: 2026-05-11
---

# Phase 12 Plan 01: Generate Capability Adapters (OpenAI, Gemini, Together) Summary

**Status**: complete
**Tasks completed**: 3/3
**One-liner**: Three thin v2 capability adapters wrapping OpenAI, Gemini, and Together v1 providers as `(generate, provider)` rows with cost/latency/quality metadata.

## Changes

- `src/capabilities/openai-generate.ts` (created, 55 lines) — exports `createOpenAIGenerateCapability()`; cost $0.04/call, latency 12000ms P50
- `src/capabilities/gemini-generate.ts` (created, 54 lines) — exports `createGeminiGenerateCapability()`; cost $0.03/call, latency 4000ms P50
- `src/capabilities/together-generate.ts` (created, 54 lines) — exports `createTogetherGenerateCapability()`; cost $0.003/call, latency 3000ms P50

## Notes

- All three adapters follow the ideogram-generate.ts factory pattern (null-on-missing-key, delegate invoke, CONSTRAINT_VIOLATION for empty prompt, PROVIDER_FAILURE wrapping)
- v1 providers return Buffer directly from `.generate()` — no URL fetching required (unlike Ideogram)
- OpenAI returns `revisedPrompt`; Gemini and Together do not — omitted from their return shapes for clarity
- `modelVersion` reads `provider.defaultModel` dynamically at factory-call time, honoring `OPENAI_DEFAULT_MODEL` env var for OpenAI
- All three files compile cleanly with `npm run build`; no TypeScript errors
- Files are NOT registered in `register.ts` — that is Plan 12-03's responsibility
- No stubs: all invoke() bodies are fully wired to v1 providers

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `af745b2` feat(12-01): add OpenAI generate capability adapter
- `95d97fe` feat(12-01): add Gemini generate capability adapter
- `f8cbf0d` feat(12-01): add Together AI generate capability adapter

## Self-Check: PASSED

- `src/capabilities/openai-generate.ts`: EXISTS
- `src/capabilities/gemini-generate.ts`: EXISTS
- `src/capabilities/together-generate.ts`: EXISTS
- Commits af745b2, 95d97fe, f8cbf0d: FOUND in git log
- `npm run build`: exit 0, no TS errors
