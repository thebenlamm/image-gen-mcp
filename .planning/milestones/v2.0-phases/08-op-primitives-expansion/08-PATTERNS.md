# Phase 8: Op Primitives Expansion - Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 14 (10 NEW, 4 MODIFY) + 2 eval-cases batches
**Analogs found:** 14 / 14 (100% — every new file has at least one direct in-repo analog)

---

## File Classification

### Plan 08-01 (Contract + 4 caps + MCP tool)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/capabilities/types.ts` | contract / type | n/a (type defs) | `src/capabilities/types.ts` (current self) + `src/utils/processing.ts` tagged-union pattern | exact (in-place modify) |
| `src/capabilities/extract-subject.ts` | capability (image, no key) | request-response | self (codemod adds `kind: 'image'`) | exact (in-place modify) |
| `src/capabilities/edit-prompt.ts` | capability (image, API key) | request-response | self (codemod adds `kind: 'image'`) | exact (in-place modify) |
| `src/capabilities/transform.ts` | capability (image, local) | transform / chain | `src/capabilities/extract-subject.ts` (no-key factory) + `src/utils/processing.ts:applyOperations` (substrate) | exact role + exact substrate |
| `src/capabilities/analyze-dimensions.ts` | capability (data, local) | analyze / read-only | `src/capabilities/extract-subject.ts` (factory shape) + `src/utils/processing.ts:getImageInfo` (sharp metadata reader) | role + helper match |
| `src/capabilities/analyze-palette.ts` | capability (data, local) | analyze / sharp | `src/capabilities/extract-subject.ts` (factory shape) + `src/utils/processing.ts` (sharp pipeline) | role + substrate |
| `src/capabilities/register.ts` | registration | barrel | self | exact (in-place modify) |
| `src/capabilities/validation.ts` | validator | request-response | self | exact (in-place modify) |
| `src/index.ts` | MCP tool surface / handler | request-response | self (`image_op` handler) + `process_image` handler (for `list_capabilities`-style read-only tool) | exact (in-place modify) |
| `eval/cases/analyze-dimensions.json` | eval case | declarative fixture | `eval/cases/extract-subject.json` (no-key, `${fixture.path}`) | exact |
| `eval/cases/analyze-palette.json` | eval case | declarative fixture | `eval/cases/extract-subject.json` | exact |
| `src/eval/types.ts` | eval contract | n/a | self (add new `EvalScorerId`s for exact-match) | exact (in-place modify) |
| `src/eval/scorers.ts` | scorer | transform | self (existing scorers establish the pattern; add new exact-match scorers for dimensions/palette) | exact (in-place modify) |

### Plan 08-02 (Composite + Upscale + OCR + worker extraction)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/utils/ocr.ts` | utility (worker pool) | shared resource | `src/eval/scorers.ts:scoreOcrTextPresence` lines 64-106 (the code being extracted) | exact (extraction target) |
| `src/eval/scorers.ts` | scorer (refactor) | transform | self (replace inline tesseract block with import from `src/utils/ocr.ts`) | exact (in-place modify) |
| `src/capabilities/composite-layers.ts` | capability (image, local) | transform / multi-input | `src/utils/processing.ts:circleMask` (only existing `sharp(...).composite([...])` callsite) + `src/capabilities/extract-subject.ts` (no-key factory) | substrate exact, role exact |
| `src/capabilities/enhance-upscale.ts` | capability (image, API key) | request-response (Replicate URL fetch) | `src/providers/replicate.ts` (Replicate client + URL→buffer fetch pattern) + `src/capabilities/edit-prompt.ts` (API-key gate, optional null factory) | hybrid: substrate + factory |
| `src/capabilities/analyze-ocr.ts` | capability (data, local heavy) | analyze / pooled worker | `src/capabilities/extract-subject.ts` (factory shape) + new `src/utils/ocr.ts` (substrate) | role exact, substrate new |
| `src/capabilities/register.ts` | registration | barrel | self | exact (in-place modify) |
| `src/capabilities/validation.ts` | validator | request-response | self | exact (in-place modify) |
| `eval/cases/composite-layers.json` | eval case | declarative fixture | `eval/cases/extract-subject.json` + `pixel_delta` scorer for golden composite | exact |
| `eval/cases/analyze-ocr.json` | eval case | declarative fixture | `eval/cases/edit-prompt.json` (uses `expectedText` + ocr scorer) | exact |
| `eval/fixtures/composite-golden.png` | golden artifact | static | `eval/fixtures/text-label.png` (existing fixture conventions) + manifest update | exact |

---

## Pattern Assignments

### `src/capabilities/types.ts` (contract — modify) — both plans depend on this

**Analog:** self (current file, lines 1-64); cross-reference `src/utils/processing.ts:1-30` for the `ProcessingOperation` tagged-union pattern that informs `AnalyzeXResult` discriminants (D-02).

**Current `CapabilityInvokeResult` to be replaced** (lines 41-46 of `src/capabilities/types.ts`):
```typescript
export interface CapabilityInvokeResult {
  buffer: Buffer;
  model: string;
  revisedPrompt?: string;
  metadata?: Record<string, unknown>;
}
```

**Tagged-union substrate pattern to mirror** (from `src/utils/processing.ts:4-30`):
```typescript
type ResizeOp = { type: 'resize'; ... };
type CropOp = { type: 'crop'; ... };
// ...
export type ProcessingOperation = ResizeOp | CropOp | AspectCropOp | CircleMaskOp;
```
The new `AnalyzeDimensionsResult | AnalyzePaletteResult | AnalyzeOcrResult` union (D-02) follows this exact tagged-discriminant convention so TS narrows on `result.data.type === 'dimensions'`. Without inner tags, `kind: 'data'` narrowing alone leaves `result.data` as a 3-member union with no discriminant.

**`CapabilityOp` enum entry to drop per D-36** (line 10 of `types.ts`):
```typescript
  | 'generate';   // ← REMOVE in 08-01; nothing registers it
```
Note: `src/eval/cases.ts:15-25` also enumerates `CAPABILITY_OPS` — that set must stay in sync. Removal is safe because no eval case references `'generate'`.

**`CapabilityInvokeError` class location:** add to `src/capabilities/types.ts` so all capability files can `import { CapabilityInvokeError } from './types.js'` (matches the existing single-source-of-truth convention for `Capability`, `CapabilityKey`, etc.).

**`ProcessingOperation` rehoming per D-11:** prefer **re-export** from `src/capabilities/types.ts` (`export type { ProcessingOperation } from '../utils/processing.js'`) over moving the type. Moving would force a corresponding edit to `src/index.ts:33` and `src/utils/processing.ts:30`, increasing blast radius. Re-export keeps `transform.ts` reachable from `'./types.js'` while leaving the canonical declaration where it lives today. Verify no duplicate `export type ProcessingOperation` after the change.

---

### `src/capabilities/extract-subject.ts` (codemod — add `kind: 'image'`)

**Current** (line 40-44):
```typescript
return {
  buffer,
  model: MODEL_VERSION,
  metadata: { input: filePath },
};
```

**After codemod** (D-04):
```typescript
return {
  kind: 'image',
  buffer,
  model: MODEL_VERSION,
  metadata: { input: filePath },
};
```
One-line addition. No other change. Apply identical codemod to `src/capabilities/edit-prompt.ts` lines 107-112.

---

### `src/capabilities/transform.ts` (NEW)

**Analog (factory shape):** `src/capabilities/extract-subject.ts:18-47` (no-API-key capability, returns `Capability` not `Capability | null`).

**Analog (substrate):** `src/utils/processing.ts:217-276` (`applyOperations`).

**Imports pattern to copy** (mirror `extract-subject.ts:1-2`):
```typescript
import { applyOperations, type ProcessingOperation } from '../utils/processing.js';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';
```

**Factory skeleton:**
```typescript
const MODEL_VERSION = 'sharp-transform@1';
const MAX_OPS = 16;

export function createTransformCapability(): Capability {
  return {
    op: 'transform',
    provider: 'sharp',
    modelVersion: MODEL_VERSION,
    constraints: {
      requiresInputImage: true,
      supportsMultipleInputs: false,
      outputFormat: 'png',
    },
    cost: { perCallUsd: 0 },
    latencyMsP50: 200,
    async invoke(input) {
      const filePath = input.params.input;
      if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new CapabilityInvokeError(
          'CONSTRAINT_VIOLATION',
          'transform requires params.input file path',
          false,
        );
      }
      const operations = input.params.operations;
      if (!Array.isArray(operations)) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'transform requires params.operations array', false);
      }
      if (operations.length > MAX_OPS) {
        throw new CapabilityInvokeError(
          'CONSTRAINT_VIOLATION',
          `transform operations chain exceeds maxOps=${MAX_OPS}`,
          false,
          'reduce the number of operations or split across multiple invocations',
        );
      }
      const buffer = await fs.promises.readFile(filePath);
      const result = await applyOperations(buffer, operations as ProcessingOperation[]);
      return {
        kind: 'image',
        buffer: result.buffer,
        model: MODEL_VERSION,
        metadata: {
          input: filePath,
          originalInfo: result.originalInfo,
          outputInfo: result.outputInfo,
          operationsApplied: result.operationsApplied,   // D-13
        },
      };
    },
  };
}
```

**Read-input-file pattern source:** `src/capabilities/edit-prompt.ts:75` uses `await fs.promises.readFile(filePath)` — copy this idiom (don't pass the file path directly to sharp; `applyOperations` takes a `Buffer`).

**ProcessingOperation Zod validation (out of scope for capability, in-scope for `validation.ts`):** `src/index.ts:215-238` is the canonical Zod schema for `ProcessingOperation[]`. The capability boundary trusts the type guard already; if richer validation is desired, lift the Zod union from `src/index.ts` into `src/utils/processing.ts` so both `process_image` and `transform` validation can share it. Otherwise rely on `applyOperations`'s exhaustive switch (line 233) to throw on bad input.

---

### `src/capabilities/analyze-dimensions.ts` (NEW, `kind: 'data'`)

**Analog (factory shape):** `src/capabilities/extract-subject.ts:18-47`.

**Analog (substrate):** `src/utils/processing.ts:49-62` (`getImageInfo`).

**Reuse `getImageInfo`:** it already returns `{ width, height, format, channels }` from `sharp(buffer).metadata()`. Read the file, pass to `getImageInfo`, then compute `hasAlpha` from `metadata.channels === 4` or call `sharp(buffer).metadata()` directly to read `hasAlpha` cleanly.

**Skeleton:**
```typescript
import * as fs from 'fs';
import sharp from 'sharp';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL_VERSION = 'sharp-metadata@1';

export function createAnalyzeDimensionsCapability(): Capability {
  return {
    op: 'analyze_dimensions',
    provider: 'sharp',
    modelVersion: MODEL_VERSION,
    constraints: { requiresInputImage: true, supportsMultipleInputs: false },
    cost: { perCallUsd: 0 },
    latencyMsP50: 30,
    async invoke(input) {
      const filePath = input.params.input;
      if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'analyze_dimensions requires params.input', false);
      }
      const buffer = await fs.promises.readFile(filePath);
      const meta = await sharp(buffer).metadata();
      if (!meta.width || !meta.height) {
        throw new CapabilityInvokeError('PROVIDER_FAILURE', 'sharp returned no dimensions', false);
      }
      return {
        kind: 'data',
        data: {
          type: 'dimensions',
          width: meta.width,
          height: meta.height,
          format: meta.format ?? 'unknown',
          channels: meta.channels ?? 0,
          hasAlpha: meta.hasAlpha ?? false,
        },
        model: MODEL_VERSION,
        metadata: { input: filePath },
      };
    },
  };
}
```

Note: `outputFormat: 'png'` is intentionally **omitted** — this is a data-returning capability (D-27), no PNG produced.

---

### `src/capabilities/analyze-palette.ts` (NEW, `kind: 'data'`)

**Analog (factory shape):** `src/capabilities/extract-subject.ts:18-47`.

**Substrate:** sharp's `.stats()` returns dominant channel info; for true k-means dominant colors, downsample → raw RGB → bucket into top-N colors. Sharp's `dominant` (per-channel, single color) is insufficient for D-29's "list of N colors". Approach: `sharp(buffer).resize(64, 64, { fit: 'inside' }).raw().toBuffer()` then count quantized RGB buckets, sort by frequency. Alternatively use `sharp(buffer).stats().then(s => s.dominant)` for the single-color simple case and document the limitation.

**Param validation (`count` clamp):**
```typescript
const requestedCount = input.params.count;
if (requestedCount !== undefined && (typeof requestedCount !== 'number' || requestedCount < 1 || requestedCount > 16)) {
  throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'analyze_palette count must be 1-16', false);
}
const count = (requestedCount as number | undefined) ?? 5;
```

**Return shape (D-02):**
```typescript
return {
  kind: 'data',
  data: {
    type: 'palette',
    colors: [{ hex: '#ff0000', r: 255, g: 0, b: 0, weight: 0.42 }, ...],
  },
  model: MODEL_VERSION,
  metadata: { input: filePath, requestedCount: count },
};
```

Sort `colors` by `weight` descending (D-29).

---

### `src/capabilities/register.ts` (modify — both plans)

**Current** (entire file, 14 lines):
```typescript
import { createEditPromptCapability } from './edit-prompt.js';
import { createExtractSubjectCapability } from './extract-subject.js';
import { capabilityRegistry } from './registry.js';

export function registerBuiltInCapabilities() {
  capabilityRegistry.register(createExtractSubjectCapability());

  const editPrompt = createEditPromptCapability();
  if (editPrompt) {
    capabilityRegistry.register(editPrompt);
  }

  return capabilityRegistry;
}
```

**08-01 additions** (3 new caps, all no-key so non-null):
```typescript
import { createTransformCapability } from './transform.js';
import { createAnalyzeDimensionsCapability } from './analyze-dimensions.js';
import { createAnalyzePaletteCapability } from './analyze-palette.js';
// ...
capabilityRegistry.register(createTransformCapability());
capabilityRegistry.register(createAnalyzeDimensionsCapability());
capabilityRegistry.register(createAnalyzePaletteCapability());
```

**08-02 additions:**
```typescript
import { createCompositeLayersCapability } from './composite-layers.js';
import { createEnhanceUpscaleCapability } from './enhance-upscale.js';
import { createAnalyzeOcrCapability } from './analyze-ocr.js';
// ...
capabilityRegistry.register(createCompositeLayersCapability());

const upscale = createEnhanceUpscaleCapability();
if (upscale) {
  capabilityRegistry.register(upscale, { allowUnscoredProduction: true });   // D-26
}

capabilityRegistry.register(createAnalyzeOcrCapability());
```

**Critical pattern (from `register.ts:8-11`):** API-key-gated factories return `Capability | null`; the caller checks for null *before* registering. `enhance_upscale` follows this idiom; the three local sharp/tesseract caps return non-null `Capability`.

**`allowUnscoredProduction` precedent:** The current `registry.ts:32-38` rejects unscored second providers; `enhance_upscale` is unscored on registration but is the **first** provider for the `enhance_upscale` op, so the gate would not fire today. Pass `allowUnscoredProduction: true` defensively — Phase 11 will register a second upscaler and the flag prevents a regression at that point.

---

### `src/capabilities/validation.ts` (modify — both plans)

**Current shape** (lines 1-38): a single `validateCapabilityParams(capability, params)` function with op-specific branches (`if (capability.op === 'edit_prompt') {...}`).

**Pattern to replicate per D-12, D-17, D-23:**
```typescript
if (capability.op === 'transform') {
  const ops = params.operations;
  if (!Array.isArray(ops)) {
    throw new Error('transform requires params.operations array');
  }
  if (ops.length > 16) {
    throw new Error(`transform operations chain exceeds maxOps=16 (got ${ops.length})`);
  }
}

if (capability.op === 'composite_layers') {
  const canvas = params.canvas as Record<string, unknown> | undefined;
  if (!canvas || typeof canvas.width !== 'number' || typeof canvas.height !== 'number') {
    throw new Error('composite_layers requires canvas.width and canvas.height');
  }
  if (canvas.width * canvas.height > 16_000_000) {
    throw new Error('composite_layers canvas exceeds 16 MP cap');
  }
  const layers = params.layers;
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new Error('composite_layers requires non-empty layers array');
  }
  if (layers.length > 16) {
    throw new Error('composite_layers layers exceed cap of 16');
  }
}

if (capability.op === 'enhance_upscale') {
  const scale = params.scale ?? 2;
  if (![2, 4].includes(scale as number)) {
    throw new Error('enhance_upscale scale must be 2 or 4');
  }
  // input MP cap requires reading file metadata — keep at capability boundary (per D-23 the cap throws CapabilityInvokeError),
  // but reject obviously bad params (negative scale, wrong type) here.
}
```

**Note:** `validation.ts` currently throws plain `Error` (e.g., line 9: `throw new Error(...)`). New checks may continue to throw `Error` here OR be promoted to `CapabilityInvokeError` for consistency with D-07. Keep the current pattern in `validation.ts` for parameter-shape errors and reserve `CapabilityInvokeError` for the capability's own `invoke()` body where structured retry semantics matter most.

**Caveat:** `validation.ts` is invoked from `src/index.ts:587` *before* `capability.invoke(...)`. Param caps (max ops, max layers, max MP) belong here. Runtime caps that require I/O (input image MP for `enhance_upscale`) belong inside the capability's `invoke()` so they can throw `CapabilityInvokeError({ code: 'INPUT_TOO_LARGE' })` with the suggestion field.

---

### `src/index.ts` (modify — 08-01)

#### Change 1: `image_op` switch on `kind` (D-05)

**Current handler** (`src/index.ts:586-647`):
```typescript
const result = await capability.invoke({ params, outputPath, outputDir });
const nodeEndedAt = Date.now();

await writeFileAtomic(artifactPath, result.buffer);

const filePath = await resolveOutputPath({...});
await saveImage(result.buffer, filePath);

const node = buildTraceNode({
  ...
  artifactPath,
  output: filePath,
  ...
});

return { ...output: filePath, runId, trace: ... };
```

**After (D-05) — branch on `result.kind`:**
```typescript
const result = await capability.invoke({ params, outputPath, outputDir });
const nodeEndedAt = Date.now();

if (result.kind === 'image') {
  await writeFileAtomic(artifactPath, result.buffer);
  const filePath = await resolveOutputPath({ outputPath, outputDir, prompt: `${op}-${provider}`, provider });
  await saveImage(result.buffer, filePath);
  const node = buildTraceNode({
    id: `n${nodeId}`, op, provider, model: result.model,
    artifactPath, output: filePath,
    startedAtMs: nodeStartedAt, endedAtMs: nodeEndedAt,
    outcome: 'success',
    revisedPrompt: result.revisedPrompt,
    metadata: result.metadata,
  });
  // ...write manifest with finalOutput: filePath...
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, output: filePath, runId, trace: ... }) }] };
}

// kind === 'data' → no save, no artifact
const node = buildTraceNode({
  id: `n${nodeId}`, op, provider, model: result.model,
  artifactPath: null,    // D-05: data nodes have no artifact
  output: null,
  startedAtMs: nodeStartedAt, endedAtMs: nodeEndedAt,
  outcome: 'success',
  metadata: result.metadata,
});
// ...write manifest without finalOutput...
return { content: [{ type: 'text', text: JSON.stringify({ success: true, data: result.data, runId, trace: ... }) }] };
```

**`buildTraceNode` impact:** check `src/runs/index.ts` for the current `artifactPath` type. If it requires non-null `string`, widen to `string | null` in 08-01. (Verify this in the `runs/` module before writing the plan — if `artifactPath` is already `string | undefined`, no change needed.)

#### Change 2: drop `'generate'` from the Zod enum (D-36)

**Current** (`src/index.ts:440`):
```typescript
op: z.enum(['extract_subject', 'edit_prompt', 'composite_layers', 'transform', 'enhance_upscale', 'analyze_dimensions', 'analyze_palette', 'analyze_ocr', 'generate'])
```
Drop `'generate'`. Also drop from `src/eval/cases.ts:15-25` (`CAPABILITY_OPS` set) and from `src/capabilities/types.ts:1-10` (`CapabilityOp` union). Three coordinated edits.

#### Change 3: `list_capabilities` MCP tool (D-34, D-35)

**Analog:** `process_image` registration at `src/index.ts:210-294` (read-only-ish tool) and `image_op` at `src/index.ts:435-453` (capability-registry-aware tool).

**Skeleton:**
```typescript
server.tool(
  'list_capabilities',
  'List all registered capabilities (op, provider, model, constraints, cost, latency, quality scores). Use this before calling image_op to discover available routes and pick by cost or quality.',
  {},
  async () => {
    const caps = capabilityRegistry.list().map((c) => ({
      op: c.op,
      provider: c.provider,
      modelVersion: c.modelVersion,
      constraints: c.constraints,
      cost: c.cost,
      latencyMsP50: c.latencyMsP50,
      quality: c.quality,
    }));
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ capabilities: caps }) }],
    };
  },
);
```
Per D-34, the serializer is "registry contents minus the `invoke` function." A simple object-spread with explicit field selection is cleaner than a destructure-and-omit.

---

### `src/utils/ocr.ts` (NEW — 08-02)

**Analog (extraction target):** `src/eval/scorers.ts:64-106` — the entire current `scoreOcrTextPresence` body holds the worker creation/teardown lifecycle that needs to be split into reusable units.

**Current code (`src/eval/scorers.ts:76-105`):**
```typescript
let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
try {
  worker = await createWorker('eng');
  const result = await worker.recognize(outputPath);
  const recognizedText = normalizeOcrText(result.data.text);
  // ...
} catch (error) {
  return { scorer: 'ocr_text_presence', status: 'error', reason: error... };
} finally {
  if (worker) {
    await worker.terminate().catch(() => undefined);
  }
}
```

**New utility shape per D-31, D-32:**
```typescript
import { createWorker } from 'tesseract.js';

type Worker = Awaited<ReturnType<typeof createWorker>>;

const pool = new Map<string, Promise<Worker>>();

export async function recognizeOnce(path: string, lang = 'eng') {
  // Per-call mode: create → recognize → terminate. Mirrors current eval behavior.
  const worker = await createWorker(lang);
  try {
    const result = await worker.recognize(path);
    return result.data;
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

export async function recognizePooled(path: string, lang = 'eng') {
  // Pooled mode: cache one worker per language.
  let workerPromise = pool.get(lang);
  if (!workerPromise) {
    workerPromise = createWorker(lang);
    pool.set(lang, workerPromise);
  }
  const worker = await workerPromise;
  const result = await worker.recognize(path);
  return result.data;
}

export async function terminatePool(): Promise<void> {
  // Optional: server shutdown hook. Phase 8 may not wire this; expose for future.
  for (const promise of pool.values()) {
    const w = await promise.catch(() => null);
    if (w) await w.terminate().catch(() => undefined);
  }
  pool.clear();
}
```

**Refactor `src/eval/scorers.ts:64-106`:** replace the inline worker block with `const data = await recognizeOnce(outputPath, 'eng');` then keep the `normalizeOcrText` / `includes(needle)` logic. The `normalizeOcrText` helper at `src/eval/scorers.ts:12-14` stays in `scorers.ts` (eval-specific) — `src/utils/ocr.ts` returns raw tesseract `data`.

---

### `src/capabilities/composite-layers.ts` (NEW — 08-02)

**Analog (factory shape):** `src/capabilities/extract-subject.ts:18-47`.

**Analog (sharp `.composite([...])` substrate):** `src/utils/processing.ts:204-211` (`circleMask`'s SVG mask composite — the only existing `.composite([])` callsite in the codebase):
```typescript
return sharp(squareBuffer)
  .composite([{
    input: circleSvg,
    blend: 'dest-in',
  }])
  .png()
  .toBuffer();
```

**D-18 critical pattern:** call `.composite([...])` once with **all** layers, never chain N sequential composites. Sharp accepts an array. Chain pathological under libvips concurrency cap of 2.

**Skeleton:**
```typescript
import * as fs from 'fs';
import sharp from 'sharp';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL_VERSION = 'sharp-composite@1';
const MAX_LAYERS = 16;
const MAX_CANVAS_MP = 16_000_000;
const MIN_SCALE = 0.05;
const MAX_SCALE = 10;

export function createCompositeLayersCapability(): Capability {
  return {
    op: 'composite_layers',
    provider: 'sharp',
    modelVersion: MODEL_VERSION,
    constraints: {
      requiresInputImage: false,    // canvas-based; layers carry the inputs
      supportsMultipleInputs: true,
      outputFormat: 'png',
    },
    cost: { perCallUsd: 0 },
    latencyMsP50: 400,
    async invoke(input) {
      const { canvas, layers } = input.params as { canvas: any; layers: any[] };
      // Param validation already in src/capabilities/validation.ts; defensive re-check here:
      if (canvas.width * canvas.height > MAX_CANVAS_MP) {
        throw new CapabilityInvokeError('INPUT_TOO_LARGE', `canvas exceeds ${MAX_CANVAS_MP / 1e6}MP`, false);
      }
      if (layers.length > MAX_LAYERS) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', `layers exceed cap ${MAX_LAYERS}`, false);
      }

      // Read + transform each layer to a sharp-ready overlay
      const overlays = await Promise.all(layers.map(async (layer, i) => {
        if (layer.scale !== undefined && (layer.scale < MIN_SCALE || layer.scale > MAX_SCALE)) {
          throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', `layer[${i}].scale out of range`, false);
        }
        const layerBuffer = await fs.promises.readFile(layer.input);
        let pipeline = sharp(layerBuffer);
        if (layer.scale && layer.scale !== 1) {
          const meta = await sharp(layerBuffer).metadata();
          if (meta.width && meta.height) {
            pipeline = sharp(layerBuffer).resize(
              Math.round(meta.width * layer.scale),
              Math.round(meta.height * layer.scale),
              { fit: 'fill' },
            );
          }
        }
        const prepared = await pipeline.png().toBuffer({ resolveWithObject: true });
        // Resolve anchor → top/left offset
        const { left, top } = resolveAnchor(layer, prepared.info);
        return {
          input: prepared.data,
          left,
          top,
          // opacity handled via PNG alpha pre-multiply if opacity < 1; document and implement
        };
      }));

      const out = await sharp({
        create: {
          width: canvas.width,
          height: canvas.height,
          channels: 4,
          background: canvas.background ?? { r: 0, g: 0, b: 0, alpha: 0 },
        },
      }).composite(overlays).png().toBuffer();

      return {
        kind: 'image',
        buffer: out,
        model: MODEL_VERSION,
        metadata: {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          layerCount: layers.length,
        },
      };
    },
  };
}

function resolveAnchor(layer: any, info: { width: number; height: number }): { left: number; top: number } {
  const x = layer.x ?? 0;
  const y = layer.y ?? 0;
  switch (layer.anchor ?? 'top-left') {
    case 'top-left':     return { left: x, top: y };
    case 'top-right':    return { left: x - info.width, top: y };
    case 'bottom-left':  return { left: x, top: y - info.height };
    case 'bottom-right': return { left: x - info.width, top: y - info.height };
    case 'center':       return { left: x - Math.round(info.width / 2), top: y - Math.round(info.height / 2) };
  }
}
```

**Sharp `create` background pattern source:** sharp's docs (Context7 for `sharp` if needed). The `{ create: { width, height, channels, background } }` constructor produces an empty canvas. The current codebase has no precedent for `create:` (only `circleMask` uses `.composite()` on a real input), so this is the one piece that has no in-repo analog — fall back to sharp's documentation.

**Opacity (`opacity?: number`)**: sharp's composite API has no direct `opacity`. Implement by pre-multiplying alpha on the layer buffer (`.ensureAlpha(layer.opacity)` or `.composite([{ input: alphaSvg, blend: 'dest-in' }])`). Document the chosen approach in the cap.

---

### `src/capabilities/enhance-upscale.ts` (NEW — 08-02)

**Analog (Replicate client + URL fetch):** `src/providers/replicate.ts` (entire file, 64 lines) — exact same pattern of `new Replicate({ auth })` → `client.run(...)` → fetch URL → `Buffer.from(arrayBuffer)`.

**Analog (API-key-gated factory returning `null`):** `src/providers/replicate.ts:58-63` and `src/capabilities/edit-prompt.ts:26-31`.

**Skeleton (combines both patterns):**
```typescript
import Replicate from 'replicate';
import sharp from 'sharp';
import * as fs from 'fs';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL = 'nightmareai/real-esrgan';                          // D-20
const MODEL_VERSION = 'nightmareai/real-esrgan@latest';           // pin version in production; document mutability
const MAX_INPUT_MP = 4_000_000;
const MAX_OUTPUT_MP = 16_000_000;
const FETCH_TIMEOUT_MS = 30_000;

function resolveOptionalEnv(value: string | undefined): string | undefined {
  // Same idiom as src/capabilities/edit-prompt.ts:18-24
  const trimmed = value?.trim();
  if (!trimmed || /^\$\{[^}]+\}$/.test(trimmed)) return undefined;
  return trimmed;
}

export function createEnhanceUpscaleCapability(): Capability | null {
  const apiToken = resolveOptionalEnv(process.env.REPLICATE_API_TOKEN);
  if (!apiToken) return null;

  const client = new Replicate({ auth: apiToken });

  return {
    op: 'enhance_upscale',
    provider: 'replicate',
    modelVersion: MODEL_VERSION,
    constraints: {
      requiresInputImage: true,
      supportsMultipleInputs: false,
      outputFormat: 'png',
    },
    cost: { perMegapixelUsd: 0.0023 },     // D-25 — verify with current Replicate pricing
    latencyMsP50: 8000,
    async invoke(input) {
      const filePath = input.params.input;
      const scale = (input.params.scale as number | undefined) ?? 2;          // D-21
      const faceEnhance = (input.params.face_enhance as boolean | undefined) ?? false;   // D-22

      if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'enhance_upscale requires params.input', false);
      }
      if (scale !== 2 && scale !== 4) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'enhance_upscale scale must be 2 or 4', false);
      }

      // Input MP gate (D-23) — reject before Replicate API call
      const buffer = await fs.promises.readFile(filePath);
      const meta = await sharp(buffer).metadata();
      const inputPixels = (meta.width ?? 0) * (meta.height ?? 0);
      if (inputPixels > MAX_INPUT_MP) {
        throw new CapabilityInvokeError(
          'INPUT_TOO_LARGE',
          `input ${inputPixels / 1e6}MP exceeds 4MP cap`,
          false,
          'reduce scale or downscale input',
        );
      }
      if (inputPixels * scale * scale > MAX_OUTPUT_MP) {
        throw new CapabilityInvokeError(
          'INPUT_TOO_LARGE',
          `output would exceed 16MP cap`,
          false,
          'reduce scale or downscale input',
        );
      }

      // client.run pattern from src/providers/replicate.ts:28-37
      const prediction = await client.predictions.create({
        version: MODEL_VERSION,
        input: {
          image: `data:image/png;base64,${buffer.toString('base64')}`,
          scale,
          face_enhance: faceEnhance,
        },
      });
      const finalPrediction = await client.wait(prediction);

      const output = finalPrediction.output;
      const imageUrl = Array.isArray(output) ? output[0] : output;
      if (typeof imageUrl !== 'string') {
        throw new CapabilityInvokeError('PROVIDER_FAILURE', 'unexpected response from Replicate', true);
      }

      // D-24: 30s timeout + 1 retry on URL fetch
      const fetchedBuffer = await fetchWithTimeoutRetry(imageUrl, FETCH_TIMEOUT_MS, 1);

      return {
        kind: 'image',
        buffer: fetchedBuffer,
        model: MODEL_VERSION,
        metadata: {
          input: filePath,
          scale,
          face_enhance: faceEnhance,
          predictionId: finalPrediction.id,    // D-24: surface for cost reconciliation
          inputMP: inputPixels / 1e6,
          outputMP: (inputPixels * scale * scale) / 1e6,
        },
      };
    },
  };
}

async function fetchWithTimeoutRetry(url: string, timeoutMs: number, retries: number): Promise<Buffer> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt === retries) {
        throw new CapabilityInvokeError(
          'TIMEOUT',
          `Replicate URL fetch failed after ${retries + 1} attempts: ${err instanceof Error ? err.message : err}`,
          true,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new CapabilityInvokeError('PROVIDER_FAILURE', 'unreachable', true);
}
```

**Note on `cost.perMegapixelUsd`:** the current `CapabilityCost` type at `src/capabilities/types.ts:30-33` already has both `perCallUsd` and `perMegapixelUsd`. Per D-25, populate `perMegapixelUsd` (not `perCallUsd`) so Phase 9's planner can scale cost by output size.

---

### `src/capabilities/analyze-ocr.ts` (NEW — 08-02)

**Analog (factory shape):** `src/capabilities/extract-subject.ts:18-47`.

**Substrate:** new `src/utils/ocr.ts:recognizePooled` (per D-32).

**Skeleton:**
```typescript
import { recognizePooled } from '../utils/ocr.js';
import type { Capability } from './types.js';
import { CapabilityInvokeError } from './types.js';

const MODEL_VERSION = 'tesseract.js@5';

export function createAnalyzeOcrCapability(): Capability {
  return {
    op: 'analyze_ocr',
    provider: 'tesseract',
    modelVersion: MODEL_VERSION,
    constraints: { requiresInputImage: true, supportsMultipleInputs: false },
    cost: { perCallUsd: 0 },
    latencyMsP50: 1500,
    async invoke(input) {
      const filePath = input.params.input;
      const lang = (input.params.lang as string | undefined) ?? 'eng';      // D-30
      const includeWords = input.params.includeWords === true;

      if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'analyze_ocr requires params.input', false);
      }

      const data = await recognizePooled(filePath, lang);

      return {
        kind: 'data',
        data: {
          type: 'ocr',
          text: data.text,
          confidence: data.confidence,
          ...(includeWords && data.words ? {
            words: data.words.map((w) => ({
              text: w.text,
              confidence: w.confidence,
              bbox: [w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1] as [number, number, number, number],
            })),
          } : {}),
        },
        model: MODEL_VERSION,
        metadata: { input: filePath, lang },
      };
    },
  };
}
```

---

### Eval cases (`eval/cases/*.json`) — both plans

**Analog format:** `eval/cases/extract-subject.json` (no-API-key, one entry per fixture).

**Schema constraints (`src/eval/cases.ts:27-46`):** every case requires `id`, `op` (must be in `CAPABILITY_OPS`), `provider`, `fixtureId`, `params` (with `${fixture.path}` substitution), `scorers` (must be in `SCORERS`).

**Critical:** the new analyze caps require new `EvalScorerId` values (e.g., `'dimensions_exact'`, `'palette_exact'`) added to `src/eval/types.ts:4` AND the `SCORERS` set in `src/eval/cases.ts:9-13`. Add corresponding scorer functions in `src/eval/scorers.ts`. Two coordinated edits.

**Composite case (D-38, 08-02):**
```json
{
  "id": "composite-golden-overlay",
  "op": "composite_layers",
  "provider": "sharp",
  "fixtureId": "composite-golden",
  "params": {
    "canvas": { "width": 512, "height": 512, "background": "#ffffff" },
    "layers": [
      { "input": "${fixture.path}", "x": 0, "y": 0 }
    ]
  },
  "scorers": ["pixel_delta"]
}
```
Note: `pixel_delta` (existing scorer) compares the produced PNG to the input fixture. For composite, the "expected" output goes in `eval/fixtures/` as a golden PNG; consider extending `EvalCase` with an `expectedOutputFixtureId` field if exact-match against a non-input is required. Otherwise repurpose `pixel_delta` semantics.

**OCR case (08-02):** copy `eval/cases/edit-prompt.json` lines 14-24 verbatim; replace `op` with `'analyze_ocr'`, `provider` with `'tesseract'`, `scorers` with `['ocr_text_presence']`, drop `requiredEnv`.

---

## Shared Patterns

### API-key-gated factory pattern

**Source:** `src/capabilities/edit-prompt.ts:18-31` + `src/providers/replicate.ts:58-63`.

**Apply to:** `enhance-upscale.ts`. The other 5 new caps are local (sharp/tesseract) and return `Capability` non-null.

```typescript
function resolveOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^\$\{[^}]+\}$/.test(trimmed)) return undefined;
  return trimmed;
}

export function createXCapability(): Capability | null {
  const apiKey = resolveOptionalEnv(process.env.SOMETHING_KEY);
  if (!apiKey) return null;
  return { /* capability */ };
}
```

The `${...}` placeholder defense at `edit-prompt.ts:20` is critical: MCP clients sometimes pass uninterpolated env-var placeholders as literal strings; treat those as absent.

**`resolveOptionalEnv` candidate for promotion:** if Phase 8 adds a third callsite, lift to `src/utils/env.ts`. Phase 8 has only one new callsite (`enhance-upscale.ts`); inline-copy is acceptable, OR proactively extract now so the planner doesn't ship copy-paste tech debt.

---

### Capability factory shape (the contract every cap satisfies)

**Source:** `src/capabilities/extract-subject.ts:18-47`.

**Apply to:** all 6 new capability files.

```typescript
const MODEL_VERSION = 'provider-or-lib@version';

export function createXCapability(): Capability /* | null if API-keyed */ {
  return {
    op: '...',
    provider: '...',
    modelVersion: MODEL_VERSION,
    constraints: { /* CapabilityConstraints */ },
    cost: { /* perCallUsd or perMegapixelUsd */ },
    latencyMsP50: NUMBER,
    async invoke(input) {
      // 1. validate params (defensively; validation.ts pre-runs)
      // 2. read input file via fs.promises.readFile
      // 3. invoke substrate (sharp/tesseract/replicate)
      // 4. return { kind, buffer | data, model, metadata }
    },
  };
}
```

`MODEL_VERSION` as a top-of-file `const` is the established convention (see `extract-subject.ts:4`, `edit-prompt.ts:33`). Keeps `modelVersion` and the metadata `model` field in sync.

---

### Atomic write of binary artifact

**Source:** `src/utils/image.ts:109-114` (`saveImage`) + `src/runs/write.ts:writeFileAtomic` (used in `src/index.ts:592`).

**Apply to:** all `kind: 'image'` capabilities — the capability returns a buffer; `image_op` does the persistence. Capability files **do not** call `saveImage` directly.

```typescript
// In src/index.ts, NOT inside the capability:
await writeFileAtomic(artifactPath, result.buffer);    // run-artifact path
await saveImage(result.buffer, filePath);              // user-facing output path
```

`kind: 'data'` capabilities (analyze_*) skip both writes (D-05).

---

### Structured error class (D-07)

**Source:** new in `src/capabilities/types.ts` (no existing analog — current code throws plain `Error`).

**Apply to:** all 6 new capabilities for actionable failures (constraint violations, input too large, provider failures, timeouts). Plain `Error` remains acceptable for programmer errors (missing required param shape) where retryability is meaningless.

```typescript
throw new CapabilityInvokeError(
  'INPUT_TOO_LARGE' | 'CONSTRAINT_VIOLATION' | 'PROVIDER_FAILURE' | 'TIMEOUT' | 'UNSUPPORTED',
  message,
  retryable: boolean,
  suggestion?: string,
);
```

**`image_op` error catch at `src/index.ts:648-700`** does not currently inspect `error.code`/`retryable`. Phase 8 may surface these in the response body (`error: { message, code, retryable, suggestion }` instead of bare `error: message`) so Phase 9's planner can branch on retryability without parsing strings. Decision deferred to planner; pattern is to add the surface in 08-01 and let 08-02 caps populate it.

---

### Validation extension pattern (op-conditional branches)

**Source:** `src/capabilities/validation.ts:13-37` (current `if (capability.op === 'edit_prompt') {...}` blocks).

**Apply to:** add one branch per new cap that has param-shape constraints (transform, composite_layers, enhance_upscale, analyze_palette).

```typescript
if (capability.op === 'NEW_OP') {
  // type-check + range-check params here
  // throw new Error(...) — keep validation errors as plain Error;
  //   reserve CapabilityInvokeError for runtime/IO failures inside invoke()
}
```

---

### Eval case JSON entry pattern

**Source:** `eval/cases/extract-subject.json` (no-API-key) and `eval/cases/edit-prompt.json` (with `requiredEnv`).

**Apply to:** all new eval case files.

```json
{
  "id": "kebab-case-unique-id",
  "op": "REGISTERED_OP",
  "provider": "REGISTERED_PROVIDER",
  "fixtureId": "FIXTURE_ID_FROM_MANIFEST",
  "params": { "input": "${fixture.path}", ... },
  "scorers": ["scorer_id"],
  "requiredEnv": ["KEY"]   // omit when no API key needed
}
```

The `${fixture.path}` substitution is performed in `src/eval/cases.ts:88-90`; only the `input` param is substituted. New scorer ids must be added to `src/eval/types.ts:4` AND the `SCORERS` set at `src/eval/cases.ts:9-13`.

---

### Vitest test layout

**Source:** existing tests under `tests/capabilities/`, `tests/eval/`, `tests/runs/`, `tests/integration/`.

**Apply to:** if 08-01 and 08-02 add tests, place them in:
- `tests/capabilities/transform.test.ts`
- `tests/capabilities/composite-layers.test.ts`
- `tests/capabilities/enhance-upscale.test.ts` (mock Replicate client; test caps without API key by mocking `process.env.REPLICATE_API_TOKEN`)
- `tests/capabilities/analyze-dimensions.test.ts`
- `tests/capabilities/analyze-palette.test.ts`
- `tests/capabilities/analyze-ocr.test.ts` (use small text fixture; tesseract is local)
- `tests/utils/ocr.test.ts` (per-call vs pooled mode)
- `tests/integration/image_op.list_capabilities.test.ts` (MCP tool integration)
- `tests/integration/image_op.kind_data.test.ts` (data-returning op end-to-end)

**Reference:** `tests/capabilities/registry-quality.test.ts` for the `capability(...)` factory helper that builds minimal `Capability` mocks.

---

## No Analog Found

| File / Pattern | Reason | Recommended Source |
|---------------|--------|--------------------|
| Sharp `{ create: { width, height, channels, background } }` canvas constructor in `composite-layers.ts` | No existing callsite; `circleMask` at `src/utils/processing.ts:204-211` only uses `.composite()` on a real input | sharp docs via Context7 (`mcp__plugin_context7_context7__query-docs` for `sharp`) |
| Pooled tesseract worker (`src/utils/ocr.ts:recognizePooled`) | Current `scoreOcrTextPresence` always terminates per call | tesseract.js worker API docs (Context7) |
| `Replicate.predictions.create` + `client.wait` two-step (vs `client.run` one-shot) for `enhance_upscale` | `src/providers/replicate.ts:28` uses `client.run`, which doesn't surface `predictionId` cleanly. D-24 needs the predictionId for cost reconciliation | Replicate Node SDK docs; `client.run` may suffice if predictionId can be extracted |
| `pixel_delta` against a non-input golden for `composite_layers` eval | All current pixel_delta cases compare output-to-input; composite needs output-to-golden | extend `EvalCase` with `expectedOutputFixtureId` OR reuse `pixel_delta` with the input being the golden |
| `CapabilityInvokeError` class | New in 08-01 | D-07 spec |
| `list_capabilities` MCP tool | New surface | Mirror minimal `image_op` registration shape at `src/index.ts:435-453` |

---

## Sequencing & Coordination Notes

**08-01 must merge before 08-02 starts.** The discriminated-union contract change in `src/capabilities/types.ts` is load-bearing for every 08-02 capability's return type. The codemod to `extract-subject.ts` and `edit-prompt.ts` (D-04) is part of 08-01 to keep `main` green between the two plans.

**Three coordinated edits for `'generate'` removal (D-36):**
1. `src/capabilities/types.ts:10` — `CapabilityOp` union
2. `src/eval/cases.ts:24` — `CAPABILITY_OPS` set
3. `src/index.ts:440` — Zod enum on `image_op`

If any one is missed, `npm run build` or `npm run eval` fails closed. Land all three in the same commit.

**`buildTraceNode` `artifactPath` typing** (08-01): verify in `src/runs/index.ts` whether `artifactPath` is `string | undefined` (works as-is for `kind: 'data'` per D-05) or `string` (must widen to `string | null | undefined`). One-line type widening if needed.

**Tesseract pool lifecycle (08-02):** Phase 8 does not wire a server-shutdown hook to call `terminatePool()`. Pool persists for the server lifetime. Note in 08-02 plan as a Phase 9 follow-up if SIGTERM cleanup becomes needed.

---

## Metadata

**Analog search scope:**
- `src/capabilities/` (full)
- `src/utils/processing.ts`, `src/utils/image.ts`
- `src/providers/replicate.ts` (Replicate client pattern)
- `src/eval/scorers.ts`, `src/eval/cases.ts`, `src/eval/types.ts`, `src/eval/run.ts`, `src/eval/apply-results.ts`
- `src/index.ts` (MCP tool surface)
- `eval/cases/*.json`, `eval/fixtures/`
- `tests/capabilities/registry-quality.test.ts`

**Files scanned:** ~20

**Pattern extraction date:** 2026-05-02
