# Phase 11: Provider Breadth (Post-Eval) - Pattern Map

**Mapped:** 2026-05-03
**Files analyzed:** 10 new/modified files
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/capabilities/photoroom-extract-subject.ts` | capability | request-response | `src/capabilities/edit-prompt.ts` | exact |
| `src/capabilities/fal-edit-prompt.ts` | capability | request-response | `src/capabilities/enhance-upscale.ts` | exact |
| `src/capabilities/ideogram-generate.ts` | capability | request-response | `src/capabilities/edit-prompt.ts` | exact |
| `src/capabilities/types.ts` (modify) | types | — | `src/capabilities/types.ts` | self |
| `src/capabilities/register.ts` (modify) | config | — | `src/capabilities/register.ts` | self |
| `src/capabilities/validation.ts` (modify) | middleware | request-response | `src/capabilities/validation.ts` | self |
| `eval/cases/photoroom.json` | test | CRUD | `eval/cases/extract-subject.json` | exact |
| `eval/cases/fal-flux-kontext.json` | test | CRUD | `eval/cases/edit-prompt.json` | exact |
| `eval/cases/ideogram.json` | test | CRUD | `eval/cases/edit-prompt.json` | exact |
| `src/eval/scorers.ts` (modify) | utility | transform | `src/eval/scorers.ts` | self |

---

## Pattern Assignments

### `src/capabilities/photoroom-extract-subject.ts` (capability, request-response)

**Analog:** `src/capabilities/edit-prompt.ts`

Photoroom is an API-key-gated, remote-HTTP capability (same shape as `edit-prompt`). It returns a PNG buffer fetched from Photoroom's Remove Background or Image Editing endpoint.

**Imports pattern** (`src/capabilities/edit-prompt.ts` lines 1–6):
```typescript
import * as fs from 'fs';
import sharp from 'sharp';
import { assertWithinInputRoot } from '../utils/path-input-root.js';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';
```

**Env-resolve helper** (`src/capabilities/edit-prompt.ts` lines 41–47):
```typescript
function resolveOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^\$\{[^}]+\}$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}
```

**API-key-gated factory returning `null`** (`src/capabilities/edit-prompt.ts` lines 57–69):
```typescript
export function createEditPromptCapability(): Capability | null {
  const apiKey = resolveOptionalEnv(process.env.OPENAI_API_KEY);

  if (!apiKey) {
    return null;
  }

  const model = resolveOptionalEnv(process.env.OPENAI_EDIT_MODEL) || 'gpt-image-1.5';

  return {
    op: 'edit_prompt',
    provider: 'openai',
    modelVersion: model,
    constraints: {
      requiresInputImage: true,
      supportsMultipleInputs: false,
      outputFormat: 'png',
    },
    cost: { perCallUsd: 0.04 },
    latencyMsP50: 12000,
    async invoke(input) { ... },
  };
}
```

**Input validation pattern inside `invoke`** (`src/capabilities/edit-prompt.ts` lines 80–98):
```typescript
const filePath = input.params.input;

if (typeof filePath !== 'string' || !filePath.trim()) {
  throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'edit_prompt requires params.input file path', false);
}
try {
  await assertWithinInputRoot(filePath);
} catch (error) {
  throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', error instanceof Error ? error.message : String(error), false);
}
```

**Timeout + abort controller + provider failure mapping** (`src/capabilities/edit-prompt.ts` lines 112–151):
```typescript
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
let response: Response;
try {
  response = await fetch('https://api.openai.com/v1/images/edits', { ... signal: controller.signal });
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') {
    throw new CapabilityInvokeError('TIMEOUT', 'OpenAI edit timed out after 30s', true);
  }
  throw error;
} finally {
  clearTimeout(timer);
}

if (!response.ok) {
  throw new CapabilityInvokeError(
    'PROVIDER_FAILURE',
    responseBody.error?.message || `OpenAI edit failed with status ${response.status}`,
    true,
  );
}
```

**Return shape** (`src/capabilities/edit-prompt.ts` lines 158–166):
```typescript
return {
  kind: 'image',
  buffer,
  model,
  revisedPrompt: imageData.revised_prompt,
  metadata: { input: filePath, size: requestedSize },
};
```

**Photoroom-specific notes:**
- Use `PHOTOROOM_API_KEY` as the env var.
- `op: 'extract_subject'`, `provider: 'photoroom'`.
- For Remove Background API: `POST https://image-api.photoroom.com/v2/segment` with `image` as form-data.
- Because `@imgly/local` is already registered for `extract_subject` (no scores yet for a second-provider check to matter), Photoroom must have eval scores before `register.ts` calls `capabilityRegistry.register()` without `allowUnscoredProduction`. Until then, gate with `allowUnscoredProduction: true` and supply `unscoredJustification` matching the `enhance-upscale` pattern (lines 14–15 of `enhance-upscale.ts`).

---

### `src/capabilities/fal-edit-prompt.ts` (capability, request-response)

**Analog:** `src/capabilities/enhance-upscale.ts` (Replicate SDK pattern for queue-based remote inference)

fal.ai uses a queue/subscribe model for Flux Kontext. The closest analog for poll-based remote provider with URL output is `enhance-upscale.ts`.

**Replicate-style SDK client init** (`src/capabilities/enhance-upscale.ts` lines 72–79):
```typescript
export function createEnhanceUpscaleCapability(): Capability | null {
  const apiToken = resolveOptionalEnv(process.env.REPLICATE_API_TOKEN);
  if (!apiToken) {
    return null;
  }

  const client = new Replicate({ auth: apiToken });
  return { ... };
}
```
For fal.ai, use `FAL_KEY` env var and `@fal-ai/client` (or raw fetch to `fal.run`); same null-return-on-missing-key pattern.

**URL-fetch-with-timeout-retry helper** (`src/capabilities/enhance-upscale.ts` lines 26–55):
```typescript
async function fetchWithTimeoutRetry(
  url: string,
  timeoutMs: number,
  retries: number,
): Promise<Buffer> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      clearTimeout(timer);
      return Buffer.from(arrayBuffer);
    } catch (error) {
      clearTimeout(timer);
      if (attempt === retries) {
        throw new CapabilityInvokeError('TIMEOUT', `... failed after ${retries + 1} attempts: ...`, true);
      }
    }
  }
  throw new CapabilityInvokeError('PROVIDER_FAILURE', 'unreachable', true);
}
```

**Extract output URL helper** (`src/capabilities/enhance-upscale.ts` lines 57–63):
```typescript
function getOutputUrl(output: unknown): string {
  const imageUrl = Array.isArray(output) ? output[0] : output;
  if (typeof imageUrl !== 'string') {
    throw new CapabilityInvokeError('PROVIDER_FAILURE', 'Replicate returned no image URL', true);
  }
  return imageUrl;
}
```

**Metadata in return** (`src/capabilities/enhance-upscale.ts` lines 152–165):
```typescript
return {
  kind: 'image',
  buffer: fetchedBuffer,
  model: MODEL_VERSION,
  metadata: {
    input: filePath,
    scale,
    predictionId: finalPrediction.id,
    inputMP: inputPixels / 1e6,
  },
};
```
For fal.ai, include `requestId` (fal queue ID) in `metadata`.

**fal.ai-specific notes:**
- `op: 'edit_prompt'`, `provider: 'fal'`.
- `modelVersion`: use the full fal model ID string (e.g., `fal-ai/flux-kontext-pro`).
- Requires `params.prompt` and `params.input` (file path, base64-encoded for fal submit, or use fal storage URL upload).
- Because `openai` is already registered for `edit_prompt`, fal must have eval scores before plain registration — use `allowUnscoredProduction: true` plus `unscoredJustification` initially, then remove once eval scores land.
- `cost`: use fal pricing per-call or per-megapixel as appropriate.
- `latencyMsP50`: fal Kontext is faster than OpenAI edits; set based on observed queue time.

---

### `src/capabilities/ideogram-generate.ts` (capability, request-response)

**Analog:** `src/capabilities/edit-prompt.ts` (remote HTTP, API key, returns base64 or URL, maps to buffer)

Ideogram 3.0 returns ephemeral URLs (not base64). Combine the fetch-with-timeout pattern from `enhance-upscale.ts` with the factory shape from `edit-prompt.ts`.

**Factory and `op` shape** (`src/capabilities/edit-prompt.ts` lines 57–78):
```typescript
export function createIdeogramGenerateCapability(): Capability | null {
  const apiKey = resolveOptionalEnv(process.env.IDEOGRAM_API_KEY);
  if (!apiKey) return null;

  return {
    op: 'generate',        // NEW — requires adding to CapabilityOp in types.ts (D-02)
    provider: 'ideogram',
    modelVersion: 'ideogram-v3-0',
    constraints: {
      requiresInputImage: false,
      outputFormat: 'png',
      supportedSizes: ['square', 'landscape', 'portrait'],
    },
    cost: { perCallUsd: 0.08 },   // confirm from Ideogram pricing
    latencyMsP50: 8000,
    async invoke(input) { ... },
  };
}
```

**Prompt validation** (mirror `edit-prompt.ts` lines 91–98):
```typescript
const prompt = input.params.prompt;
if (typeof prompt !== 'string' || !prompt.trim()) {
  throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'generate requires params.prompt', false);
}
if (prompt.length > MAX_PROMPT_LENGTH) {
  throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'generate prompt exceeds max length', false);
}
```

**Ephemeral URL download** (mirror `enhance-upscale.ts` `fetchWithTimeoutRetry`):
```typescript
// Ideogram returns { data: [{ url: "...", seed: ... }] }
const imageUrl = responseBody.data?.[0]?.url;
if (typeof imageUrl !== 'string') {
  throw new CapabilityInvokeError('PROVIDER_FAILURE', 'No image URL returned from Ideogram', true);
}
const buffer = await fetchWithTimeoutRetry(imageUrl, FETCH_TIMEOUT_MS, 1);
```

**Return** (`src/capabilities/edit-prompt.ts` lines 158–165):
```typescript
return {
  kind: 'image',
  buffer,
  model: 'ideogram-v3-0',
  metadata: { prompt, seed: responseBody.data?.[0]?.seed },
};
```

**Ideogram-specific notes:**
- Must add `'generate'` to `CapabilityOp` union in `src/capabilities/types.ts` (D-02/D-03).
- `generate` is a new op with no incumbent; Ideogram registers as the only provider — `allowUnscoredProduction: true` applies until OCR-backed eval scores land, OR (since it is the only provider) the registry's second-provider gate is not triggered and it can register without scores.
- Check `registry.ts` line 24: the unscored gate fires only when `sameOpProviders.length > 0`. Ideogram as the sole `generate` provider bypasses the gate — but D-11 says trace must state there is no incumbent comparison.
- `params.prompt` required. `params.size` maps to Ideogram aspect ratio.

---

### `src/capabilities/types.ts` (modify — add `generate` to `CapabilityOp`)

**Analog:** `src/capabilities/types.ts` self (lines 1–9)

Current union (lines 1–9):
```typescript
export type CapabilityOp =
  | 'extract_subject'
  | 'edit_prompt'
  | 'composite_layers'
  | 'transform'
  | 'enhance_upscale'
  | 'analyze_dimensions'
  | 'analyze_palette'
  | 'analyze_ocr';
```

Add `| 'generate'` when Ideogram capability file is created (D-02 enum policy: the op exists only when at least one provider registers it).

Also add `generate` to the `CAPABILITY_OPS` set in `src/eval/cases.ts` lines 17–26 and `EvalScorerId` in `src/eval/types.ts` if new scorers are introduced.

---

### `src/capabilities/register.ts` (modify — wire new factories)

**Analog:** `src/capabilities/register.ts` self (lines 1–31)

**Current registration pattern** (lines 11–31):
```typescript
export function registerBuiltInCapabilities() {
  capabilityRegistry.register(createExtractSubjectCapability());

  const editPrompt = createEditPromptCapability();
  if (editPrompt) {
    capabilityRegistry.register(editPrompt);
  }

  // ...

  const upscale = createEnhanceUpscaleCapability();
  if (upscale) {
    capabilityRegistry.register(upscale, { allowUnscoredProduction: true });
  }
  // ...
}
```

**Copy pattern for new providers:**
```typescript
// Photoroom — extract_subject second provider (requires allowUnscoredProduction until eval scores)
const photoroomExtract = createPhotoroomExtractSubjectCapability();
if (photoroomExtract) {
  capabilityRegistry.register(photoroomExtract, { allowUnscoredProduction: true });
}

// fal.ai Flux Kontext — edit_prompt second provider (same gate)
const falEditPrompt = createFalEditPromptCapability();
if (falEditPrompt) {
  capabilityRegistry.register(falEditPrompt, { allowUnscoredProduction: true });
}

// Ideogram — generate (new op, sole provider, no second-provider gate fires)
const ideogramGenerate = createIdeogramGenerateCapability();
if (ideogramGenerate) {
  capabilityRegistry.register(ideogramGenerate);
}
```

Once eval scores are applied via `applyEvalResultsToRegistry`, re-registration replaces `quality` in-place (`registry.ts` line 68). The `allowUnscoredProduction` option is only needed at initial registration, not at eval re-registration.

---

### `src/capabilities/validation.ts` (modify — add `generate` and new op params)

**Analog:** `src/capabilities/validation.ts` self (lines 9–115)

**Pattern for adding a new op block** (lines 19–21):
```typescript
if (capability.op === 'edit_prompt') {
  if (typeof params.prompt !== 'string' || params.prompt.trim().length === 0) {
    throw new Error('edit_prompt requires params.prompt');
  }
}
```

Add a parallel block for `generate`:
```typescript
if (capability.op === 'generate') {
  if (typeof params.prompt !== 'string' || params.prompt.trim().length === 0) {
    throw new Error('generate requires params.prompt');
  }
}
```

No additional Photoroom-specific validation needed beyond the existing `requiresInputImage` check (lines 12–16). fal.ai Flux Kontext also uses `edit_prompt` so the existing `edit_prompt` block already handles it.

---

### `eval/cases/photoroom.json` (new eval case file)

**Analog:** `eval/cases/extract-subject.json`

Full extract-subject case structure:
```json
[
  {
    "id": "extract-subject-photoroom-product",
    "op": "extract_subject",
    "provider": "photoroom",
    "fixtureId": "product-simple",
    "params": { "input": "${fixture.path}" },
    "scorers": ["alpha_coverage"],
    "requiredEnv": ["PHOTOROOM_API_KEY"]
  }
]
```

**Photoroom-specific additions:**
- Add `"scorers": ["alpha_coverage", "pixel_delta"]` for cases that compare against `@imgly/local` baseline to measure edge quality delta.
- Each case must include `"requiredEnv": ["PHOTOROOM_API_KEY"]` — eval runner skips gracefully when absent (see `src/eval/run.ts` lines 23–25, 73–84).
- `pixel_delta` scorer compares to a known reference (the `@imgly/local` output on the same fixture). This requires the scorer to be wired against the input fixture path, which is the `inputPath` argument in `runScorers` (`src/eval/scorers.ts` lines 54–67).

---

### `eval/cases/fal-flux-kontext.json` (new eval case file)

**Analog:** `eval/cases/edit-prompt.json`

Full edit-prompt case structure:
```json
[
  {
    "id": "edit-fal-kontext-color",
    "op": "edit_prompt",
    "provider": "fal",
    "fixtureId": "product-simple",
    "params": {
      "input": "${fixture.path}",
      "minPixelDelta": 0.01,
      "prompt": "Change the product rectangle to a saturated blue while preserving the off-white background."
    },
    "scorers": ["pixel_delta"],
    "requiredEnv": ["FAL_KEY"]
  },
  {
    "id": "edit-fal-kontext-text",
    "op": "edit_prompt",
    "provider": "fal",
    "fixtureId": "text-label",
    "params": {
      "input": "${fixture.path}",
      "minPixelDelta": 0.01,
      "prompt": "Change the label text from SALE 25 to SALE 50 while keeping the label style.",
      "expectedText": "SALE 50"
    },
    "scorers": ["pixel_delta", "ocr_text_presence"],
    "requiredEnv": ["FAL_KEY"]
  }
]
```

**Notes from D-16/D-17:**
- Include at least one latency-oriented case alongside quality scorers (record `latencyMs` in `EvalCaseResult`; `src/eval/run.ts` line 144).
- Use the same fixtures as the incumbent OpenAI cases to make head-to-head score comparison valid.

---

### `eval/cases/ideogram.json` (new eval case file)

**Analog:** `eval/cases/edit-prompt.json` (for `ocr_text_presence` scorer pattern)

Text-heavy generation cases use `ocr_text_presence` with `expectedText`. The scorer is already wired in `src/eval/scorers.ts` lines 69–105 and `runScorers` lines 228–243.

```json
[
  {
    "id": "generate-ideogram-text-label",
    "op": "generate",
    "provider": "ideogram",
    "fixtureId": "text-heavy",
    "params": {
      "prompt": "A product label reading FRESH ROAST in large bold letters on a cream background.",
      "expectedText": "FRESH ROAST"
    },
    "scorers": ["ocr_text_presence"],
    "requiredEnv": ["IDEOGRAM_API_KEY"]
  }
]
```

**Notes from D-18:**
- `fixtureId` for generation-only cases may not need `"input": "${fixture.path}"` since Ideogram is text-to-image (no `requiresInputImage`). The `getInputPath` call in `src/eval/run.ts` line 104 only runs if `input` is in params — confirm the eval runner doesn't require it unconditionally.
- `ocr_text_presence` scorer requires `params.expectedText` (enforced by `cases.ts` lines 87–91).
- Add `generate` to `CAPABILITY_OPS` set in `src/eval/cases.ts` line 18.

---

### `src/eval/scorers.ts` (modify — add new scorers if needed)

**Analog:** `src/eval/scorers.ts` self

No new scorer functions are required for Phase 11: `ocr_text_presence`, `alpha_coverage`, and `pixel_delta` cover all cases in D-15/D-16/D-17/D-18.

If a **word-order or normalized-match** scorer is needed for Ideogram beyond substring match, extend `scoreOcrTextPresence` (`src/eval/scorers.ts` lines 69–105) with a word-set overlap variant:

```typescript
// Extension pattern (copy scoreOcrTextPresence, change scorer id in EvalScorerId first):
export async function scoreOcrWordOverlap(
  outputPath: string,
  expectedText?: string,
): Promise<EvalScore> {
  // same recognizeOnce call, then compute word set intersection / expected word count
}
```

If added, the new `EvalScorerId` must be added to:
1. `src/eval/types.ts` line 4 — `EvalScorerId` union
2. `src/eval/cases.ts` line 9 — `SCORERS` Set
3. `src/eval/scorers.ts` `runScorers` dispatcher (lines 206–268)

---

## Shared Patterns

### API-Key Gating (apply to all new capability factories)

**Source:** `src/capabilities/edit-prompt.ts` lines 41–61
```typescript
function resolveOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^\$\{[^}]+\}$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function createXxxCapability(): Capability | null {
  const apiKey = resolveOptionalEnv(process.env.XXX_API_KEY);
  if (!apiKey) {
    return null;            // graceful skip — no throw
  }
  // ...
}
```

### Unscored-Second-Provider Gate (apply when registering alongside an existing provider for the same op)

**Source:** `src/capabilities/registry.ts` lines 24–48; `src/capabilities/register.ts` lines 24–28

Pattern: when `sameOpProviders.length > 0` and new provider has no scores, registry throws unless `allowUnscoredProduction: true` is passed. For Phase 11 second providers (Photoroom for `extract_subject`, fal for `edit_prompt`):
```typescript
// In register.ts
capabilityRegistry.register(capability, { allowUnscoredProduction: true });
// capability.quality.unscoredJustification must be non-empty string
```

```typescript
// In capability file — quality field
quality: {
  unscoredJustification: 'Phase 11 initial registration; eval scores pending from photoroom eval cases',
},
```

### Error Handling (apply inside all `invoke` implementations)

**Source:** `src/capabilities/edit-prompt.ts` lines 130–150; `src/capabilities/enhance-upscale.ts` lines 44–54

```typescript
// Timeout + abort
if (error instanceof Error && error.name === 'AbortError') {
  throw new CapabilityInvokeError('TIMEOUT', '... timed out after Xs', true);
}
// HTTP failure
if (!response.ok) {
  throw new CapabilityInvokeError('PROVIDER_FAILURE', `... failed with status ${response.status}`, true);
}
// Missing output
if (!imageData) {
  throw new CapabilityInvokeError('PROVIDER_FAILURE', 'No image data returned', true);
}
// Constraint violation (non-retryable)
throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', '...', false);
```

Error codes: `CONSTRAINT_VIOLATION` (non-retryable, bad caller input), `PROVIDER_FAILURE` (retryable), `TIMEOUT` (retryable), `INPUT_TOO_LARGE` (non-retryable), `UNSUPPORTED` (non-retryable). Source: `src/capabilities/types.ts` lines 91–96.

### Eval Case Schema (apply to all new `eval/cases/*.json` files)

**Source:** `src/eval/cases.ts` lines 28–46; `src/eval/types.ts` lines 19–27

Required fields: `id` (unique string), `op` (in `CAPABILITY_OPS` set), `provider`, `fixtureId` (must exist in fixture manifest), `params` (object), `scorers` (array of valid `EvalScorerId`). Optional: `requiredEnv` (string array — causes graceful skip when env absent).

Validation is enforced at load time by `isEvalCase` — all Phase 11 case files will be validated before eval runs.

### Trace Visibility for Unmeasured Providers (applies to planner + dag-executor)

**Source:** `src/task/planner.ts` lines 62–81; `src/runs/trace.ts` lines 1–74

The planner receives the capability snapshot including `quality.scores` (line 70). When `quality.scores` is undefined/empty, the planner sees `null` for that provider's quality — it should route on cost/latency only and the trace `metadata` field should carry `qualityMeasured: false`.

**TraceNode fields to surface** (`src/runs/trace.ts` lines 3–23):
```typescript
// metadata in dag-executor runNodeWithRetry (line 177):
metadata: sanitizedMetadata(result.metadata),
```
New provider capabilities should include in their `invoke` return `metadata`:
```typescript
metadata: {
  input: filePath,
  provider: 'photoroom',       // explicit for clarity in trace
  modelVersion: MODEL_VERSION,
  qualityMeasured: false,       // flip to true after eval run lands scores
}
```

### Registration in `register.ts` (apply when adding each new capability)

**Source:** `src/capabilities/register.ts` lines 11–31

Import pattern to copy:
```typescript
import { createPhotoroomExtractSubjectCapability } from './photoroom-extract-subject.js';
import { createFalEditPromptCapability } from './fal-edit-prompt.js';
import { createIdeogramGenerateCapability } from './ideogram-generate.js';
```

Null-guard pattern to copy (lines 14–17):
```typescript
const editPrompt = createEditPromptCapability();
if (editPrompt) {
  capabilityRegistry.register(editPrompt);
}
```

---

## No Analog Found

All Phase 11 files have close analogs. No file is entirely without precedent in this codebase.

---

## Metadata

**Analog search scope:** `src/capabilities/`, `src/eval/`, `src/task/`, `src/runs/`, `eval/cases/`
**Files scanned:** 16
**Pattern extraction date:** 2026-05-03
