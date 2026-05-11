# Phase 15: Style Anchoring - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Autonomous — grey areas resolved by Zed + Matt

<domain>
## Phase Boundary

Add an optional `reference_image` parameter to `generate_image` and `generate_batch`. When provided, the call transparently routes through the `edit_prompt:openai` capability (using `gpt-image-1.5`) rather than the v1 raw generation path. The reference image anchors scene geometry and lighting; the new prompt governs content. The routing decision is visible in the returned trace via a `routedVia: 'edit_prompt'` field.

**In scope:**
- `reference_image?: string` parameter added to `generate_image` tool schema (optional, absolute path)
- `reference_image?: string` parameter added to `generate_batch` tool schema (batch-level, applied to every item)
- Handler branching logic in `src/index.ts` (`generate_image`) and `src/batch.ts` (`generate_batch`)
- Routing through `capabilityRegistry.get('edit_prompt', 'openai').invoke()` — NOT through the v1 `ImageProvider.generate()` path
- Model is pinned to `gpt-image-1.5` by the existing `edit_prompt:openai` capability (reads `OPENAI_EDIT_MODEL`, defaults to `gpt-image-1.5`)
- `routedVia: 'edit_prompt'` field in the response when style anchoring is active, plus `model: 'gpt-image-1.5'` and `referenceImage` path reflected in the response
- `reference_image` paths validated with `assertWithinInputRoot()` before invoking the capability
- Unit/integration tests covering the branching, routing signal, and path validation
- CLAUDE.md and AGENTS.md documentation updates

**Out of scope:**
- New capability registration (edit_prompt:openai is already registered in Phase 8)
- Changes to the edit_prompt capability itself (it is used as-is via its invoke() contract)
- Style anchoring for `generate_asset` (out of scope; no requirement for it; image_task handles multi-op sequencing for asset workflows)
- Multiple reference images for style anchoring (the edit_prompt capability has `supportsMultipleInputs: false`)
- Provider choice for style anchoring (STYLE-03 mandates gpt-image-1.5 / edit_prompt:openai; no other provider has an edit_prompt capability currently)
- Changes to the v2 capability layer types or schemas

</domain>

<decisions>
## Implementation Decisions

### Decision 1: Architecture — capability registry path, not v1 provider direct call

**Zed:** Phase 14 went v1 direct because batch is semantically "bulk generate_image" — same interface, same path, no routing needed. Style anchoring is different. It is a different operation: you're editing a reference, not generating from scratch. The edit_prompt capability exists precisely for this. Routing through `capabilityRegistry.get('edit_prompt', 'openai').invoke()` is the right call — it uses the already-validated, already-tested implementation with proper error types, MIME detection, and OpenAI API contract.

**Matt:** Agreed. Calling the v1 OpenAI provider's `generate()` method for style anchoring would be wrong — that method has no input image parameter at all. The OpenAI images.edits endpoint is entirely different from images.generate. There's no way to do this through the v1 provider interface. The capability registry path is not just architecturally correct, it's the only path that works without duplicating the entire edit-prompt HTTP call.

**Decision:** Style anchoring routes through `capabilityRegistry.get('edit_prompt', 'openai').invoke()`. The handler checks if the capability is registered (OPENAI_API_KEY present) and returns a clear error if not, rather than silently falling back to raw generation.

---

### Decision 2: edit_prompt invoke() input contract

The existing `edit_prompt:openai` capability (src/capabilities/edit-prompt.ts) expects:

```typescript
capability.invoke({
  params: {
    input: string,   // absolute file path to the reference image (PNG, JPEG, or WebP)
    prompt: string,  // the new content prompt
    size?: 'square' | 'landscape' | 'portrait',  // optional
  },
  outputPath?: string,
  outputDir?: string,
})
```

The capability reads the file from disk (not a buffer), converts it to base64+MIME data URL, and calls `https://api.openai.com/v1/images/edits`. It returns `{ kind: 'image', buffer, model, revisedPrompt, metadata }`.

`reference_image` is passed directly as `params.input`. No pre-conversion needed — the capability handles MIME detection internally via sharp metadata.

---

### Decision 3: Model pinning — already handled by the existing capability

**Zed:** STYLE-03 says "routes through edit_prompt (gpt-image-1.5)". The `edit_prompt:openai` capability already reads `OPENAI_EDIT_MODEL` env var defaulting to `'gpt-image-1.5'`. The `modelVersion` field on the registered capability reflects this. No new pinning logic needed.

**Matt:** Do NOT allow callers to override the model through generate_image's `model` parameter when reference_image is active. The `model` param is a v1 generation hint; passing it to the edit capability's invoke params would silently do nothing (edit_prompt ignores unknown params) and could confuse callers who think they're switching models. When `reference_image` is set, the `model` param is ignored with a warning in the response if provided.

**Decision:** When `reference_image` is set:
- The `model` param from `generate_image` is ignored
- The capability uses its own model (env-configured, defaults to `gpt-image-1.5`)
- The response includes `model: result.model` from the capability result (which is the actual model used)
- If `model` was specified by the caller alongside `reference_image`, include `warning: "model parameter ignored when reference_image is set; routing through edit_prompt:openai (gpt-image-1.5)"` in the response

---

### Decision 4: generate_image schema and handler branching

**Zed:** Add `reference_image` as an optional `z.string()` parameter. Document it clearly: absolute path to a reference PNG/JPEG/WebP used to anchor scene geometry and lighting. When present, the call routes through `edit_prompt` (gpt-image-1.5).

**Matt:** The branching is a simple `if (reference_image)` check before the existing `resolveProvider()` / `imageProvider.generate()` call. The edit path and the generate path share output resolution (`resolveOutputPath`) and save logic (`saveImage`) but diverge at the actual API call.

**Decision — generate_image schema addition:**

```
reference_image?: z.string().optional()
  .describe('Absolute path to a reference image (PNG/JPEG/WebP) that anchors scene geometry and lighting. When set, the call routes through edit_prompt (gpt-image-1.5) instead of raw generation. Provider and model params are ignored.')
```

**Handler branching:**

```
async ({ prompt, provider, model, size, outputPath, outputDir, style, reference_image }) => {
  if (reference_image) {
    // STYLE ANCHOR PATH
    return handleGenerateImageWithReference({ prompt, style, size, reference_image, outputPath, outputDir, model });
  }
  // EXISTING GENERATE PATH (unchanged)
  ...
}
```

Extract the style-anchor path into a helper function `handleGenerateImageWithReference()` or inline it with a clear comment block. Inline is fine given the handler is already in src/index.ts.

---

### Decision 5: generate_batch schema and handler branching

**Zed:** Add `reference_image?: string` at the batch top level (not per-item). Same reference image applies to every item. Per-item reference images are BATCH-F01 territory — don't go there.

**Matt:** The batch handler already has a clean "resolve provider once, then map over items" structure. When `reference_image` is present, the item loop calls the edit capability instead of `imageProvider.generate()`. The capability call needs `params.prompt` (the per-item effective prompt) and `params.input` (the batch-level reference_image path). Same `size` semantics — passed through to the capability's `params.size` if provided.

**Decision — generate_batch schema addition:**

```
reference_image?: z.string().optional()
  .describe('Absolute path to a reference image applied to every item. When set, all items route through edit_prompt (gpt-image-1.5).')
```

**Handler branching:** In the per-item task builder, branch on `reference_image`:
- If set: call `capabilityRegistry.get('edit_prompt', 'openai').invoke({ params: { input: reference_image, prompt: effectivePrompt, size: effectiveSize }, outputPath: item.outputPath, outputDir })`
- If not set: existing `imageProvider.generate()` path

The `provider` and `max_concurrent` parameters still apply to the non-reference path. When `reference_image` is set, `provider` is effectively overridden to `openai/edit_prompt`. Add a `routedVia: 'edit_prompt'` field to per-item results when the edit path is used.

---

### Decision 6: Trace visibility — routedVia field (STYLE-03)

**Zed:** The simplest signal is a `routedVia: 'edit_prompt'` field in the top-level response. Not in the trace nodes (those already show the op/provider/model). Just a flat field on the response object.

**Matt:** That's not enough — the trace should also be self-describing. The model in the response should reflect `gpt-image-1.5`, not whatever the default generation model would have been. And `referenceImage` in the response helps callers audit which anchor was applied. The response should have:

```json
{
  "success": true,
  "path": "...",
  "provider": "openai",
  "model": "gpt-image-1.5",
  "routedVia": "edit_prompt",
  "referenceImage": "/path/to/reference.png",
  "revisedPrompt": "..."
}
```

For `generate_batch`, the batch-level response includes `"routedVia": "edit_prompt"` and `"referenceImage"` when the reference path was active. Per-item results include `"routedVia": "edit_prompt"` so callers can see it in the items array too.

**Decision:** Add `routedVia: 'edit_prompt'` and `referenceImage: string` to the response when `reference_image` is set. For batch, add these at both the batch level and per-item. `model` in the response reflects the actual capability model (`gpt-image-1.5`).

---

### Decision 7: Capability availability guard

**Matt:** What happens when `reference_image` is set but the `edit_prompt:openai` capability is not registered (no OPENAI_API_KEY)? The call should fail clearly, not silently fall through to raw generation. Style anchoring without the reference being honored would produce wrong results and mislead callers.

**Zed:** Return an error response immediately: `{ success: false, error: "Style anchoring requires edit_prompt:openai capability (OPENAI_API_KEY not configured)" }`. No fallback. Same as generate_image does for missing provider.

**Decision:** Before invoking the edit path, check `capabilityRegistry.get('edit_prompt', 'openai')`. If null, return an error response immediately. Do NOT fall back to raw generation.

---

### Decision 8: Path validation

The `edit_prompt` capability calls `assertWithinInputRoot(filePath)` internally. But `generate_image` and `generate_batch` currently have no such guard (they don't take input image paths). The `reference_image` path check is delegated to the capability — the capability will throw `CapabilityInvokeError('CONSTRAINT_VIOLATION', ...)` if the path violates `IMAGE_GEN_INPUT_ROOT`. That error is caught and returned as `{ success: false, error: ... }` in the handler.

**Decision:** No extra path validation in the handler — delegate to the capability. The capability already enforces `assertWithinInputRoot` before reading the file. Callers get a clear `CONSTRAINT_VIOLATION` error message if the path is outside the allowed root.

---

### Decision 9: Output path resolution — unchanged

**Zed:** Same `resolveOutputPath()` logic regardless of whether reference_image is used. The edit path produces a PNG buffer just like the generate path. Same save logic.

**Matt:** Confirmed. The capability returns `{ kind: 'image', buffer, model, revisedPrompt }`. The handler calls `resolveOutputPath()` and `saveImage()` identically. No new path logic.

**Decision:** Output path resolution is identical for both paths. `resolveOutputPath({ outputPath, outputDir, prompt, provider: 'openai' })` applies in both cases.

---

### Decision 10: size parameter behavior with reference_image

The `edit_prompt` capability supports `params.size` with the same `'square' | 'landscape' | 'portrait'` enum as `generate_image`. When `reference_image` is set:
- If `size` is provided, pass it through to `params.size` in the capability invoke
- No `sizeDropped` warning — edit_prompt supports all three sizes

The `provider` parameter's `sizeDropped` logic is irrelevant for the edit path (provider resolution is skipped).

**Decision:** Pass `size` from the caller directly to `params.size` in the edit capability invocation when `reference_image` is set.

---

### Decision 11: Plan count

**Zed:** Two plans: (1) implementation — handler branching in generate_image and generate_batch, tests, (2) documentation. Docs are a real plan, not an afterthought: CLAUDE.md and AGENTS.md need the style anchoring pattern documented clearly.

**Matt:** Tests and implementation belong together in plan 1. Plan 2 is docs only. Clean split.

**Decision:** 2 plans.
- `15-01-PLAN.md` — `reference_image` param to generate_image and generate_batch, style anchor branching, capability guard, routedVia response field, unit/integration tests
- `15-02-PLAN.md` — CLAUDE.md and AGENTS.md documentation updates with style anchoring examples

</decisions>

<code_context>
## Existing Code Insights

### edit_prompt:openai capability (src/capabilities/edit-prompt.ts)

The capability is already registered when OPENAI_API_KEY is present. Key invoke() contract:

```typescript
capability.invoke({
  params: {
    input: string,         // absolute path to reference image (PNG/JPEG/WebP)
    prompt: string,        // content prompt
    size?: 'square' | 'landscape' | 'portrait',
  },
  outputPath?: string,
  outputDir?: string,
})
// Returns: { kind: 'image', buffer: Buffer, model: string, revisedPrompt?: string, metadata: { input: filePath, size: requestedSize } }
```

- Model: reads `OPENAI_EDIT_MODEL` env var, defaults to `'gpt-image-1.5'`
- Validates `params.input` exists and is non-empty
- Calls `assertWithinInputRoot(filePath)` — throws `CapabilityInvokeError('CONSTRAINT_VIOLATION', ...)` on violation
- Validates `params.prompt` is non-empty and ≤ 4000 chars
- Throws `CapabilityInvokeError` on timeout, provider failure, unsupported format
- Cost: `$0.04/call`, latency P50: `12000ms`

### Capability registry lookup (src/index.ts line 590)

```typescript
const capability = capabilityRegistry.get(op as CapabilityOp, provider);
// Returns: Capability | undefined
```

For style anchoring:
```typescript
const editCapability = capabilityRegistry.get('edit_prompt', 'openai');
if (!editCapability) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Style anchoring requires edit_prompt:openai capability (OPENAI_API_KEY not configured)' }) }] };
}
const result = await editCapability.invoke({ params: { input: reference_image, prompt: effectivePrompt, size }, outputPath, outputDir });
```

### generate_image handler (src/index.ts lines 89-174)

Current shape:
```typescript
async ({ prompt, provider, model, size, outputPath, outputDir, style }) => {
  const resolved = resolveProvider(provider, !!size, DEFAULT_PROVIDER);
  if ('error' in resolved) { return errorResponse; }
  const imageProvider = resolved.provider;
  const effectivePrompt = buildEffectivePrompt(prompt, style);
  const result = await imageProvider.generate({ prompt: effectivePrompt, model, size: effectiveSize });
  const filePath = await resolveOutputPath({ outputPath, outputDir, prompt, provider: providerName });
  await saveImage(result.buffer, filePath);
  return { success: true, path: filePath, provider: providerName, model: result.model, revisedPrompt: result.revisedPrompt };
}
```

Add `reference_image` to the destructured args. Add if-branch before `resolveProvider()`:
```typescript
if (reference_image) {
  // STYLE ANCHOR PATH
  const editCapability = capabilityRegistry.get('edit_prompt', 'openai');
  if (!editCapability) { return clearErrorResponse; }
  const effectivePrompt = buildEffectivePrompt(prompt, style);
  const result = await editCapability.invoke({ params: { input: reference_image, prompt: effectivePrompt, size }, outputPath, outputDir });
  if (result.kind !== 'image') { return internalError; }
  const filePath = await resolveOutputPath({ outputPath, outputDir, prompt, provider: 'openai' });
  await saveImage(result.buffer, filePath);
  const response: Record<string, unknown> = { success: true, path: filePath, provider: 'openai', model: result.model, routedVia: 'edit_prompt', referenceImage: reference_image, revisedPrompt: result.revisedPrompt };
  if (model) { response.warning = 'model parameter ignored when reference_image is set; routing through edit_prompt:openai (gpt-image-1.5)'; }
  return jsonResponse(response);
}
// ... existing generate path unchanged ...
```

### generate_batch handler (src/batch.ts)

`GenerateBatchArgs` interface needs `reference_image?: string`.

In the per-item task builder (lines 94-124), branch on `reference_image`:

```typescript
if (reference_image) {
  const editCapability = capabilityRegistry.get('edit_prompt', 'openai');
  if (!editCapability) {
    throw new Error('Style anchoring requires edit_prompt:openai capability (OPENAI_API_KEY not configured)');
  }
  const capResult = await editCapability.invoke({
    params: { input: reference_image, prompt: effectivePrompt, size: effectiveSize },
    outputPath: item.outputPath,
    outputDir,
  });
  if (capResult.kind !== 'image') throw new Error('edit_prompt returned non-image result');
  // use capResult.buffer, capResult.model, capResult.revisedPrompt
  return { index, success: true, path: filePath, provider: 'openai', model: capResult.model, revisedPrompt: capResult.revisedPrompt, routedVia: 'edit_prompt' as const, durationMs: ... };
} else {
  const result = await imageProvider.generate({ prompt: effectivePrompt, size: effectiveSize });
  // existing path
}
```

The capability guard (`capabilityRegistry.get('edit_prompt', 'openai')` check) inside the per-item try/catch means a missing OPENAI_API_KEY will fail per-item with a clear error — which is acceptable for batch. If the caller wants to catch this earlier, they'd see item[0].error on the first failure. This is consistent with batch's "per-item failure isolation" design.

The batch response when `reference_image` is set adds batch-level fields:
```json
{
  "batchRunId": "...",
  "status": "success",
  "routedVia": "edit_prompt",
  "referenceImage": "/path/to/ref.png",
  "summary": { "total": 3, "succeeded": 3, "failed": 0 },
  "items": [...]
}
```

### capabilityRegistry import (src/index.ts line 15, src/batch.ts needs adding)

`src/index.ts` already imports `capabilityRegistry` from `./capabilities/index.js`. `src/batch.ts` currently does NOT import from capabilities — it only uses provider-utils and runs. Add:
```typescript
import { capabilityRegistry } from './capabilities/index.js';
```

### CapabilityInvokeError handling in generate_image/generate_batch

The capability throws `CapabilityInvokeError` on timeout, provider failure, constraint violation. The handler must catch these and convert to the standard error response shape. The `code`, `retryable`, and `suggestion` fields are available on `CapabilityInvokeError` — include them in the error response to match the `image_op` pattern. For generate_batch, the per-item try/catch already converts any `Error` to `{ success: false, error: err.message }` — this naturally handles CapabilityInvokeError since it extends Error.

### CapabilityInvokeError import

```typescript
import { CapabilityInvokeError, capabilityRegistry } from './capabilities/index.js';
```

Already imported in `src/index.ts` (line 15). For `src/batch.ts`, add the import.

### Test patterns (tests/integration/generate_batch.test.ts)

Tests mock `provider-utils.js` entirely using `vi.mock()`. For Phase 15 tests, additionally mock `./capabilities/index.js` to stub `capabilityRegistry.get()`. Pattern:

```typescript
vi.mock('../../src/capabilities/index.js', () => ({
  capabilityRegistry: {
    get: vi.fn(),
    list: vi.fn(() => []),
  },
  CapabilityInvokeError: class CapabilityInvokeError extends Error {
    constructor(public code: string, message: string, public retryable: boolean) { super(message); }
  },
  registerBuiltInCapabilities: vi.fn(),
}));
```

The `mockEditCapability.invoke` returns `{ kind: 'image', buffer: FAKE_PNG, model: 'gpt-image-1.5' }`.

</code_context>

<specifics>
## Specific Implementation Ideas

### generate_image handler sketch (style anchor branch)

```typescript
server.tool(
  'generate_image',
  '...',
  {
    // ... existing params ...
    reference_image: z.string().optional().describe(
      'Absolute path to a reference image (PNG/JPEG/WebP) that anchors scene geometry and lighting. When set, routes through edit_prompt (gpt-image-1.5). Provider and model params are ignored.'
    ),
  },
  async ({ prompt, provider, model, size, outputPath, outputDir, style, reference_image }) => {
    const effectivePrompt = buildEffectivePrompt(prompt, style);

    if (reference_image) {
      const editCap = capabilityRegistry.get('edit_prompt', 'openai');
      if (!editCap) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            success: false,
            error: 'Style anchoring requires edit_prompt:openai capability. Ensure OPENAI_API_KEY is configured.',
          }) }],
        };
      }
      try {
        const result = await editCap.invoke({
          params: { input: reference_image, prompt: effectivePrompt, size },
          outputPath,
          outputDir,
        });
        if (result.kind !== 'image') throw new Error('edit_prompt returned non-image result');
        const filePath = await resolveOutputPath({ outputPath, outputDir, prompt, provider: 'openai' });
        await saveImage(result.buffer, filePath);
        const response: Record<string, unknown> = {
          success: true,
          path: filePath,
          provider: 'openai',
          model: result.model,
          routedVia: 'edit_prompt',
          referenceImage: reference_image,
          revisedPrompt: result.revisedPrompt,
        };
        if (model) {
          response.warning = 'model parameter ignored when reference_image is set; routing through edit_prompt:openai (gpt-image-1.5)';
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isCapError = error instanceof CapabilityInvokeError;
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            success: false,
            error: isCapError ? { message, code: error.code, retryable: error.retryable } : { message },
            referenceImage: reference_image,
          }) }],
        };
      }
    }

    // EXISTING GENERATE PATH — unchanged below
    const resolved = resolveProvider(provider, !!size, DEFAULT_PROVIDER);
    // ...
  }
);
```

### GenerateBatchArgs type extension

```typescript
export interface GenerateBatchArgs {
  items: BatchItem[];
  provider?: ProviderName;
  style?: string;
  size?: 'square' | 'landscape' | 'portrait';
  outputDir?: string;
  max_concurrent?: number;
  reference_image?: string;  // ADD THIS
}
```

### BatchItemResult type extension

```typescript
export interface BatchItemResult {
  index: number;
  success: boolean;
  path?: string;
  error?: string;
  provider: string;
  model?: string;
  revisedPrompt?: string;
  routedVia?: 'edit_prompt';  // ADD THIS
}
```

### generate_batch schema addition (src/index.ts)

```typescript
reference_image: z.string().optional().describe(
  'Absolute path to a reference image applied to every item in the batch. When set, all items route through edit_prompt (gpt-image-1.5). Provider param is overridden.'
),
```

### Unit tests to write (tests/integration/generate_batch_style.test.ts or add to generate_batch.test.ts)

1. **reference_image routes through capability**: verify `editCap.invoke()` is called with `params.input === reference_image` and `params.prompt === effectivePrompt`; response includes `routedVia: 'edit_prompt'` and `referenceImage`
2. **missing capability returns error**: when `capabilityRegistry.get('edit_prompt', 'openai')` returns undefined, response is `{ success: false, error: '...' }`
3. **reference_image applies to all batch items**: 3 items → editCap.invoke() called 3 times, all results have `routedVia: 'edit_prompt'`
4. **per-item failure isolation still works with reference_image**: one invoke() rejects → partial batch status, other items succeed
5. **generate_image reference_image happy path**: routes to capability, response has `routedVia`, `referenceImage`, `model: 'gpt-image-1.5'`
6. **generate_image model warning**: when `model` param and `reference_image` both set → response includes `warning` field
7. **generate_image missing capability**: clean error response
8. **size passed through**: `size: 'landscape'` → editCap.invoke called with `params.size === 'landscape'`

Test file: add style-anchoring tests to `tests/integration/generate_batch.test.ts` for batch cases. Create `tests/integration/generate_image_style.test.ts` for generate_image cases (keep generate_image tests separate since the existing test surface for generate_image is currently in the general unit tests).

</specifics>

<deferred>
## Deferred Ideas

- **Style anchoring for generate_asset**: no requirement; image_task + template handles complex asset workflows
- **Fal edit_prompt as fallback**: fal-edit-prompt capability exists (src/capabilities/fal-edit-prompt.ts) but there's no requirement to use it for style anchoring. Only gpt-image-1.5 is called out in STYLE-03. Fal routing for edit is an image_op concern, not a generate_image concern.
- **Per-item reference_image in generate_batch**: different reference per item would require per-item provider resolution. Defer to future milestone (aligns with BATCH-F01 per-item override pattern).
- **Eval scores for style anchoring quality**: the requirement is geometric/lighting preservation, which is subjective. No eval case added in this phase — that's a future quality gate.
- **Retry logic for CapabilityInvokeError with retryable: true**: the DAG executor has retry logic; generate_image/generate_batch do not. Consistent with Phase 14 — no retry added. Caller can re-invoke.
- **generate_batch manifest: record reference_image in invocation**: the manifest's `invocation.batchItems` type could include `referenceImage`. Minor audit improvement, not required by any STYLE requirement. Skip for now — the top-level manifest already records the invocation tool and provider.
- **image_task integration**: style anchoring via reference_image is for the generate_image/generate_batch surface. image_task callers who want style anchoring already use edit_prompt as a DAG node with input_images. No template needed.

</deferred>
