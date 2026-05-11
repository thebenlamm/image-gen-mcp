# Phase 12: Routing Transparency - Pattern Map

**Mapped:** 2026-05-11
**Files analyzed:** 7 (5 new capability files, 1 modified register.ts, 1 new test)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/capabilities/openai-generate.ts` | capability adapter | request-response | `src/capabilities/ideogram-generate.ts` | exact |
| `src/capabilities/gemini-generate.ts` | capability adapter | request-response | `src/capabilities/ideogram-generate.ts` | exact |
| `src/capabilities/grok-generate.ts` | capability adapter | request-response | `src/capabilities/ideogram-generate.ts` | exact |
| `src/capabilities/replicate-generate.ts` | capability adapter | request-response | `src/capabilities/ideogram-generate.ts` | exact |
| `src/capabilities/together-generate.ts` | capability adapter | request-response | `src/capabilities/ideogram-generate.ts` | exact |
| `src/capabilities/register.ts` | registry wiring | config | `src/capabilities/register.ts` (current) | exact (modify) |
| `tests/capabilities/register-smoke.test.ts` | integration test | — | `tests/capabilities/registry-quality.test.ts` | role-match |

---

## Pattern Assignments

### `src/capabilities/openai-generate.ts` (capability adapter, request-response)

**Analog:** `src/capabilities/ideogram-generate.ts`
**V1 provider to delegate to:** `src/providers/openai.ts` — `createOpenAIProvider()` / `OpenAIProvider`

**Imports pattern** (ideogram-generate.ts lines 1-2):
```typescript
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';
```
OpenAI adapter additionally needs the v1 factory:
```typescript
import { createOpenAIProvider } from '../providers/openai.js';
```

**Key provider facts from `src/providers/openai.ts`:**
- API key env: `OPENAI_API_KEY`
- Default model: `process.env.OPENAI_DEFAULT_MODEL?.trim() || 'gpt-image-1'` (lines 21-22)
- Size map: `{ square: '1024x1024', landscape: '1536x1024', portrait: '1024x1536' }` (lines 4-8)
- Returns `b64_json` inline — no ephemeral URL fetch needed (line 41)
- Returns `revisedPrompt` from `imageData.revised_prompt` (line 43)

**Factory + null-on-missing-key pattern** (ideogram-generate.ts lines 88-93):
```typescript
export function createOpenAIGenerateCapability(): Capability | null {
  const provider = createOpenAIProvider();
  if (!provider) {
    return null;
  }
  // ...
}
```

**Capability object shape** (ideogram-generate.ts lines 94-106):
```typescript
return {
  op: 'generate',
  provider: 'openai',
  modelVersion: provider.defaultModel,           // dynamic — reads OPENAI_DEFAULT_MODEL
  constraints: {
    requiresInputImage: false,
    supportsMultipleInputs: false,
    maxPromptLength: 32000,                       // OpenAI limit; no enforcement needed
    supportedSizes: ['square', 'landscape', 'portrait'],
    outputFormat: 'png',
  },
  cost: { perCallUsd: 0.04 },                    // approximate — based on provider pricing page 2026-05
  latencyMsP50: 12000,                           // approximate — based on provider pricing page 2026-05
  quality: {
    unscoredJustification: 'v1 text-to-image provider in production via generate_image; routing parity with v1 surface is a transparency gate, not a quality gate. Eval cases pending future milestone.',
  },
  async invoke(input) { ... }
};
```

**Invoke body pattern** (ideogram-generate.ts lines 107-166) — adapted for OpenAI's `generate()` delegation:
```typescript
async invoke(input) {
  const prompt = input.params.prompt;
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'generate requires params.prompt', false);
  }

  let result;
  try {
    result = await provider.generate({
      prompt,
      size: (input.params.size as 'square' | 'landscape' | 'portrait' | undefined),
    });
  } catch (error) {
    throw new CapabilityInvokeError(
      'PROVIDER_FAILURE',
      error instanceof Error ? error.message : String(error),
      true,
    );
  }

  return {
    kind: 'image',
    buffer: result.buffer,
    model: result.model,
    revisedPrompt: result.revisedPrompt,
    metadata: {
      prompt,
      provider: 'openai',
      modelVersion: result.model,
      qualityMeasured: false,
    },
  };
},
```

**Error codes to use** (types.ts lines 92-97):
- `CONSTRAINT_VIOLATION` (retryable: false) — bad/missing prompt
- `PROVIDER_FAILURE` (retryable: true) — any error from `provider.generate()`
- `TIMEOUT` (retryable: true) — if wrapping the provider call with AbortController (only needed if the v1 provider doesn't handle timeouts itself)

---

### `src/capabilities/gemini-generate.ts` (capability adapter, request-response)

**Analog:** `src/capabilities/ideogram-generate.ts`
**V1 provider to delegate to:** `src/providers/gemini.ts` — `createGeminiProvider()` / `GeminiProvider`

**Key provider facts from `src/providers/gemini.ts`:**
- API key env: `GEMINI_API_KEY` (line 18)
- Default model: `'gemini-2.5-flash-image'` (line 12)
- Size maps via aspect ratio: `{ square: '1:1', landscape: '16:9', portrait: '9:16' }` (lines 4-8)
- Returns buffer inline from `inlineData` — no URL fetch needed (lines 56-58)
- No `revisedPrompt`

**Capability metadata:**
```typescript
{
  op: 'generate',
  provider: 'gemini',
  modelVersion: 'gemini-2.5-flash-image',
  cost: { perCallUsd: 0.03 },       // approximate — based on provider pricing page 2026-05
  latencyMsP50: 4000,               // approximate — based on provider pricing page 2026-05
  quality: { unscoredJustification: '...' },  // same text as openai above
}
```

**Invoke body:** Same delegation pattern as openai-generate above. `provider.generate()` throws `Error` on failure — wrap with `CapabilityInvokeError('PROVIDER_FAILURE', ..., true)`.

---

### `src/capabilities/grok-generate.ts` (capability adapter, request-response)

**Analog:** `src/capabilities/ideogram-generate.ts`
**V1 provider to delegate to:** `src/providers/grok.ts` — `createGrokProvider()` / `GrokProvider`

**Key provider facts from `src/providers/grok.ts`:**
- API key env: `XAI_API_KEY` (line 10)
- Default model: `'grok-imagine-image'` (line 6)
- `supportsSize = false` — provider ignores size param (line 7)
- Returns buffer from b64_json inline — no URL fetch needed (line 46)
- No `revisedPrompt`

**Grok-specific constraint — must be enforced in `invoke()` because `image_op` bypasses the planner:**
```typescript
const MAX_PROMPT_LENGTH = 1024;

// in invoke():
if (prompt.length > MAX_PROMPT_LENGTH) {
  throw new CapabilityInvokeError(
    'CONSTRAINT_VIOLATION',
    'generate prompt exceeds Grok max length 1024',
    false,
  );
}
```

**Capability metadata:**
```typescript
{
  op: 'generate',
  provider: 'grok',
  modelVersion: 'grok-imagine-image',
  constraints: {
    requiresInputImage: false,
    supportsMultipleInputs: false,
    maxPromptLength: 1024,                        // enforced — xAI hard limit
    supportedSizes: ['square', 'landscape', 'portrait'],
    outputFormat: 'png',
  },
  cost: { perCallUsd: 0.02 },      // approximate — based on provider pricing page 2026-05
  latencyMsP50: 5000,              // approximate — based on provider pricing page 2026-05
  quality: { unscoredJustification: '...' },
}
```

---

### `src/capabilities/replicate-generate.ts` (capability adapter, request-response)

**Analog:** `src/capabilities/ideogram-generate.ts`
**V1 provider to delegate to:** `src/providers/replicate.ts` — `createReplicateProvider()` / `ReplicateProvider`

**Key provider facts from `src/providers/replicate.ts`:**
- API key env: `REPLICATE_API_TOKEN` (line 17)
- Default model: `'black-forest-labs/flux-1.1-pro'` (line 13)
- Size maps via aspect ratio string: `{ square: '1:1', landscape: '16:9', portrait: '9:16' }` (lines 4-8)
- `provider.generate()` already fetches the URL internally (lines 43-50) — buffer returned directly
- No `revisedPrompt`

**Capability metadata:**
```typescript
{
  op: 'generate',
  provider: 'replicate',
  modelVersion: 'black-forest-labs/flux-1.1-pro',
  cost: { perCallUsd: 0.004 },     // approximate — based on provider pricing page 2026-05
  latencyMsP50: 6000,              // approximate — based on provider pricing page 2026-05
  quality: { unscoredJustification: '...' },
}
```

---

### `src/capabilities/together-generate.ts` (capability adapter, request-response)

**Analog:** `src/capabilities/ideogram-generate.ts`
**V1 provider to delegate to:** `src/providers/together.ts` — `createTogetherProvider()` / `TogetherProvider`

**Key provider facts from `src/providers/together.ts`:**
- API key env: `TOGETHER_API_KEY` (line 16)
- Default model: `'black-forest-labs/FLUX.1-schnell'` (line 12)
- Size maps via width/height: `{ square: {1024,1024}, landscape: {1440,960}, portrait: {960,1440} }` (lines 3-7)
- Returns buffer from b64_json inline — no URL fetch (line 53)
- No `revisedPrompt`

**Capability metadata:**
```typescript
{
  op: 'generate',
  provider: 'together',
  modelVersion: 'black-forest-labs/FLUX.1-schnell',
  cost: { perCallUsd: 0.003 },     // approximate — based on provider pricing page 2026-05
  latencyMsP50: 3000,              // approximate — based on provider pricing page 2026-05
  quality: { unscoredJustification: '...' },
}
```

---

### `src/capabilities/register.ts` (modify — add 5 registrations + fix Ideogram)

**Current file:** `src/capabilities/register.ts` (55 lines, fully read above)

**Two changes needed:**

1. **Add 5 new imports** (after existing import block, lines 1-13):
```typescript
import { createGeminiGenerateCapability } from './gemini-generate.js';
import { createGrokGenerateCapability } from './grok-generate.js';
import { createOpenAIGenerateCapability } from './openai-generate.js';
import { createReplicateGenerateCapability } from './replicate-generate.js';
import { createTogetherGenerateCapability } from './together-generate.js';
```

2. **Replace the Ideogram registration block and add 5 new registrations** (current lines 49-52):

Current (broken once second `generate` cap registers):
```typescript
const ideogramGenerate = createIdeogramGenerateCapability();
if (ideogramGenerate) {
  capabilityRegistry.register(ideogramGenerate);   // <-- missing allowUnscoredProduction
}
```

Replace with:
```typescript
const ideogramGenerate = createIdeogramGenerateCapability();
if (ideogramGenerate) {
  capabilityRegistry.register(ideogramGenerate, { allowUnscoredProduction: true });
}

const openaiGenerate = createOpenAIGenerateCapability();
if (openaiGenerate) {
  capabilityRegistry.register(openaiGenerate, { allowUnscoredProduction: true });
}

const geminiGenerate = createGeminiGenerateCapability();
if (geminiGenerate) {
  capabilityRegistry.register(geminiGenerate, { allowUnscoredProduction: true });
}

const grokGenerate = createGrokGenerateCapability();
if (grokGenerate) {
  capabilityRegistry.register(grokGenerate, { allowUnscoredProduction: true });
}

const replicateGenerate = createReplicateGenerateCapability();
if (replicateGenerate) {
  capabilityRegistry.register(replicateGenerate, { allowUnscoredProduction: true });
}

const togetherGenerate = createTogetherGenerateCapability();
if (togetherGenerate) {
  capabilityRegistry.register(togetherGenerate, { allowUnscoredProduction: true });
}
```

**Registration option contract** (registry-quality.test.ts lines 80-89): `allowUnscoredProduction: true` requires `quality.unscoredJustification` to be a non-empty string on the capability object itself, or the registry throws. The justification must live in the capability `quality` field, not in the register call.

---

### `tests/capabilities/register-smoke.test.ts` (new integration test)

**Analog:** `tests/capabilities/registry-quality.test.ts` + `tests/capabilities/ideogram-generate.test.ts`

**Test structure pattern** (ideogram-generate.test.ts lines 1-15):
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBuiltInCapabilities } from '../../src/capabilities/register.js';
import { capabilityRegistry } from '../../src/capabilities/registry.js';

beforeEach(() => {
  // stub all provider API keys
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.XAI_API_KEY = 'test-key';
  process.env.REPLICATE_API_TOKEN = 'test-token';
  process.env.TOGETHER_API_KEY = 'test-key';
  process.env.IDEOGRAM_API_KEY = 'test-key';
  // ... other keys
});

afterEach(() => {
  // restore all keys
  vi.unstubAllGlobals();
});
```

**Core smoke test assertion:**
```typescript
describe('registerBuiltInCapabilities smoke test', () => {
  it('does not throw when all provider keys are present', () => {
    expect(() => registerBuiltInCapabilities()).not.toThrow();
  });

  it('registers all 6 generate providers', () => {
    registerBuiltInCapabilities();
    const providers = ['ideogram', 'openai', 'gemini', 'grok', 'replicate', 'together'];
    for (const provider of providers) {
      expect(capabilityRegistry.get('generate', provider)).toBeDefined();
    }
  });
});
```

Note: `capabilityRegistry` is a singleton — each test that calls `registerBuiltInCapabilities()` may need a fresh registry or the test must account for prior registrations. Check `src/capabilities/registry.ts` to see if it exposes a reset/clear method; if not, instantiate a local `CapabilityRegistry` and pass it through, or rely on the fact that re-registration of the same `(op, provider)` key is idempotent (verify in registry source).

---

## Shared Patterns

### Factory: null-on-missing-key
**Source:** `src/capabilities/ideogram-generate.ts` lines 88-93
**Apply to:** All 5 new capability files

The recommended approach for this codebase is to delegate to the v1 provider factory rather than re-reading the env var directly:
```typescript
export function createXxxGenerateCapability(): Capability | null {
  const provider = createXxxProvider();  // returns null when API key missing
  if (!provider) {
    return null;
  }
  return { ... };
}
```
This avoids duplicating the `resolveOptionalEnv` logic that already lives in each v1 provider factory.

### Error Translation
**Source:** `src/capabilities/ideogram-generate.ts` lines 109-113, 132-138, 142-148
**Apply to:** All 5 new capability files

Three error codes for generate operations:
- `CONSTRAINT_VIOLATION` (`retryable: false`) — bad prompt, exceeded maxPromptLength
- `PROVIDER_FAILURE` (`retryable: true`) — network error, non-OK HTTP, unexpected response shape
- `TIMEOUT` (`retryable: true`) — AbortController fires (only relevant if adapter adds its own timeout)

Since v1 providers throw plain `Error` objects (not `CapabilityInvokeError`), each adapter's `invoke()` must catch and re-throw:
```typescript
try {
  result = await provider.generate({ prompt, size: ... });
} catch (error) {
  if (error instanceof CapabilityInvokeError) throw error;
  throw new CapabilityInvokeError(
    'PROVIDER_FAILURE',
    error instanceof Error ? error.message : String(error),
    true,
  );
}
```

### unscoredJustification Text (verbatim from CONTEXT.md)
**Apply to:** All 5 new capability files AND the updated Ideogram registration

Place this string in `quality.unscoredJustification` on the capability object (not in the register call):
```typescript
quality: {
  unscoredJustification: 'v1 text-to-image provider in production via generate_image; routing parity with v1 surface is a transparency gate, not a quality gate. Eval cases pending future milestone.',
},
```

### allowUnscoredProduction Registration Pattern
**Source:** `src/capabilities/register.ts` lines 29-31, 34-36, 40-42, 44-47
**Apply to:** All 6 generate registrations in register.ts (including Ideogram fix)

```typescript
const cap = createXxxGenerateCapability();
if (cap) {
  capabilityRegistry.register(cap, { allowUnscoredProduction: true });
}
```

### Test env-key stubbing
**Source:** `tests/capabilities/ideogram-generate.test.ts` lines 3-15
**Apply to:** `tests/capabilities/register-smoke.test.ts`

Use `beforeEach`/`afterEach` with direct `process.env` assignment + `vi.unstubAllGlobals()` cleanup. Restore undefined keys by deleting rather than setting to undefined.

---

## No Analog Found

None. All files have close analogs in the codebase.

---

## Metadata

**Analog search scope:** `src/capabilities/`, `src/providers/`, `tests/capabilities/`
**Files scanned:** 14 (5 provider files, 7 capability files, 2 test files)
**Pattern extraction date:** 2026-05-11
