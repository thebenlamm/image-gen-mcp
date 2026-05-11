# Phase 14: Batch Generation - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Autonomous — grey areas resolved by Zed + Matt

<domain>
## Phase Boundary

Add a `generate_batch` MCP tool that accepts an array of `{prompt, outputPath?}` items and executes them as a single approved call. All items share a top-level provider and style. Each item generates independently via the v1 `ImageProvider` interface (same path as `generate_image`). A single batch run ID scopes a manifest and per-item trace entries. Item failures are isolated: a single provider error does not abort remaining items; the batch manifest records each failure inline.

**In scope:**
- `generate_batch` tool in `src/index.ts` alongside `generate_image`
- v1 provider path (call `ImageProvider.generate()` directly — no capability registry involvement)
- Batch run artifact: one `manifest.json` per batch under `.runs/<batchRunId>/`, per-item trace nodes
- Per-item failure isolation via per-item try/catch; batch `status` becomes `'partial'` when at least one item fails but at least one succeeds
- Concurrency cap: 3 API calls in flight at once (above sharp's 2 but safe for remote API calls)
- CLAUDE.md and AGENTS.md updates for `generate_batch` surface
- Unit tests covering: happy path, per-item failure isolation, provider fallback error, partial batch status

**Out of scope:**
- Per-item provider override (BATCH-F01, deferred)
- Style seed / numeric seed (BATCH-F02, deferred)
- Async/job-queue batch (out of scope per REQUIREMENTS.md)
- `generate_batch` for non-generate ops (image_task handles multi-op; batch is generation-only)
- Routing through the capability registry (generate_batch uses v1 providers directly, consistent with generate_image)

</domain>

<decisions>
## Implementation Decisions

### Decision 1: v1 providers directly, not capability registry

**Zed:** `generate_image` calls `ImageProvider.generate()` directly. `generate_batch` is a bulk `generate_image`. There is zero reason to route through the capability registry — that adds latency for routing-transparency bookkeeping that batch callers don't need and haven't asked for. Same interface, same path.

**Matt:** Agreed. The capability registry's `generate` ops exist for `image_task` planner routing and `image_op` direct invocation. `generate_batch` is a convenience wrapper over `generate_image` semantics, not a capability dispatch. Keeping it on the v1 path also means batch inherits `resolveProvider()` logic (size fallback, sizeDropped warning) for free.

**Decision:** `generate_batch` calls the v1 `ImageProvider.generate()` directly via the existing `resolveProvider()` helper. No capability registry involvement.

---

### Decision 2: Tool schema

**Zed:** Keep it tight. The only required field per item is `prompt`. `outputPath` is optional per-item (auto-generated from prompt + provider + hash if absent, matching `generate_image` behavior). Top-level fields: `provider` (optional, enum, same list as `generate_image`), `style` (optional string, prepended to each item's prompt), `size` (optional enum, applied to all items), `max_concurrent` (optional int, default 3, max 8). No `model` at this point — adds complexity for no clear user need.

**Matt:** `model` omission is fine for now; the provider selection covers the main use case. One thing missing: `outputDir` at the top level. If the caller wants all outputs in a specific folder without specifying every path, they need it. Add `outputDir` (optional string) as a top-level batch-wide default. Per-item `outputPath` overrides it for that item.

**Zed:** Yes, `outputDir` as top-level default is the right affordance. So resolution order per item: (1) item's `outputPath` if present, (2) top-level `outputDir` if present, (3) default `IMAGE_GEN_OUTPUT_DIR` (existing `resolveOutputPath` behavior).

**Decision — Tool schema:**

```
generate_batch(
  items: Array<{
    prompt: string;          // required
    outputPath?: string;     // optional, per-item override (must end in .png)
  }>;
  provider?: enum(openai | gemini | replicate | together | grok);
  style?: string;            // prepended to every item prompt
  size?: enum(square | landscape | portrait);
  outputDir?: string;        // default output dir for all items
  max_concurrent?: number;   // default 3, max 8, min 1
)
```

Validation at handler entry: `items` must be non-empty array (throw if empty), max 50 items (practical cap; error on exceed rather than silently truncating).

---

### Decision 3: Concurrency model

**Zed:** Sharp concurrency is capped at 2 via `SHARP_CONCURRENCY_LIMIT`. But `generate_batch` doesn't use sharp — it makes remote API calls. Remote API calls are network-bound, not CPU-bound. Cap at 3 concurrent requests. Why 3? It's the sweet spot: fast enough to hide latency across items, low enough to avoid hitting rate limits on providers like OpenAI that have per-minute limits. 8 is the hard max a caller can request.

**Matt:** The `max_concurrent` param is the right lever. Users with Together AI (which has more generous limits) can push it to 5-8. Users on OpenAI's free tier should set it to 1. Document the defaults clearly. No auto-tuning per provider — that's premature.

**Decision:** Default `max_concurrent = 3`. Caller-configurable up to 8, minimum 1. Implemented as a simple semaphore: maintain a "slots" counter, await on a queue if all slots are in use. Use `Promise.allSettled()` semantics (not `Promise.all`) so failures don't abort the remaining queue.

Implementation sketch:
```typescript
async function runBatch<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrent: number,
): Promise<PromiseSettledResult<T>[]> {
  // semaphore-based queue; returns PromiseSettledResult[] to preserve order
}
```

---

### Decision 4: Run artifact shape

**Zed:** One batch run ID, one `manifest.json`, per-item trace nodes. Items get node IDs like `item-0`, `item-1`, ... (zero-indexed, matching the input array order). No subdirectory per item. The batch manifest is a single `manifest.json` inside `.runs/<batchRunId>/`. Output images go to caller-specified `outputPath` or auto-generated path — NOT under `.runs/`, consistent with `generate_image` behavior.

**Matt:** The manifest needs a batch-specific invocation shape since the current `RunManifest.invocation` type only supports `tool: 'image_op' | 'image_task'`. We need to extend the `tool` union to include `'generate_batch'` and add a `batchItems` field to invocation. Per-item traces go in `nodes[]` where each node covers one generate call.

**Zed:** Extend the `RunManifest` type minimally. Add `'generate_batch'` to the `tool` union. Add an optional `batchItems` field to `invocation`. Keep per-item trace nodes as `RunManifestNode[]` — they already have `id`, `op`, `provider`, `model`, `outcome`, `error`, `durationMs`. Each item becomes a `RunManifestNode` with `id: 'item-0'` etc.

**Decision — Manifest shape:**

```json
{
  "schemaVersion": 1,
  "runId": "run-...",
  "startedAt": "...",
  "endedAt": "...",
  "status": "success" | "partial" | "error",
  "invocation": {
    "tool": "generate_batch",
    "provider": "openai",
    "style": "...",
    "size": "square",
    "outputDir": "...",
    "batchItems": [
      { "prompt": "...", "outputPath": "..." },
      ...
    ]
  },
  "nodes": [
    { "id": "item-0", "op": "generate", "provider": "openai", "model": "...", "outcome": "success", "durationMs": 4200 },
    { "id": "item-1", "op": "generate", "provider": "openai", "model": "...", "outcome": "error", "error": "...", "durationMs": 800 }
  ],
  "totalDurationMs": 12400
}
```

Manifest `status` values:
- `"success"` — all items succeeded
- `"partial"` — at least one item succeeded and at least one failed
- `"error"` — all items failed (or provider resolution failed before any items ran)

The `"partial"` status is a new value not present in `RunManifest.status` today. Extend the type union.

---

### Decision 5: Failure isolation — per-item try/catch

**Zed:** Each item's generate call is wrapped in its own try/catch. Failures are caught, recorded in the item result, and don't abort the queue. After all items settle, the tool response summarizes: how many succeeded, how many failed, per-item results.

**Matt:** The tool response must clearly separate successes from failures. Return an `items` array in the response with one entry per input item in the same order. Each entry has: `{ index: number; success: boolean; path?: string; error?: string; provider: string; model?: string; revisedPrompt?: string }`. This way the caller can iterate the response array and know exactly which prompts produced outputs and which didn't.

**Decision — Response shape:**

```json
{
  "batchRunId": "run-...",
  "status": "success" | "partial" | "error",
  "summary": { "total": 5, "succeeded": 4, "failed": 1 },
  "items": [
    {
      "index": 0,
      "success": true,
      "path": "/Users/me/Downloads/generated-images/...",
      "provider": "openai",
      "model": "gpt-image-1",
      "revisedPrompt": "..."
    },
    {
      "index": 1,
      "success": false,
      "error": "Provider rate limit exceeded",
      "provider": "openai"
    }
  ]
}
```

Provider resolution failure (unknown provider, no API key) is fatal for the whole batch — return an error response before processing any items, same as `generate_image` does.

---

### Decision 6: Output path resolution per item

**Zed:** Resolution order per item: (1) item `outputPath` wins, (2) top-level `outputDir` with auto-generated filename, (3) `IMAGE_GEN_OUTPUT_DIR` default with auto-generated filename. This reuses `resolveOutputPath()` exactly — pass `outputPath: item.outputPath, outputDir: batchOutputDir, prompt: item.prompt, provider: providerName`.

**Matt:** What if an `outputPath` already exists? `saveImage()` does an atomic temp-file-rename, which overwrites. That's fine and consistent with `generate_image`. Document it as "existing files are overwritten" in the tool description.

**Decision:** Use `resolveOutputPath()` per-item with the resolution order above. Overwrite existing files (atomic write via saveImage). No collision detection — batch is a generation tool, not a file manager.

---

### Decision 7: where batch artifacts live

**Zed:** Output images go to user-specified paths (or auto-generated under `IMAGE_GEN_OUTPUT_DIR`). The run artifact directory `.runs/<batchRunId>/` contains only `manifest.json` — no item PNG artifacts stored there. This is consistent with `generate_image` (which doesn't create a run dir at all). The batch run dir is created solely for the manifest, not for artifact storage.

**Matt:** Correct. Unlike `image_op` and `image_task`, `generate_image` has no run dir. For `generate_batch`, we create one run dir for the batch manifest (for BATCH-03 traceability) but the output images go to caller-controlled paths, not under `.runs/`. This keeps the artifact contract clear: run dirs are metadata, not output storage.

**Decision:** Create `.runs/<batchRunId>/manifest.json` for batch traceability. Output images go to caller-controlled paths (via `resolveOutputPath`). No per-item PNG artifacts under `.runs/`.

---

### Decision 8: Manifest type extension

The existing `RunManifest.invocation.tool` type is `'image_op' | 'image_task'`. The `RunManifest.status` type is `'in_progress' | 'success' | 'error'`. Both must be extended.

**Decision:** Extend `RunManifest` in `src/runs/manifest.ts`:
- `invocation.tool`: add `'generate_batch'`
- `invocation.batchItems`: add `optional Array<{ prompt: string; outputPath?: string }>`
- `status`: add `'partial'`

This is a small surgical extension — no other manifest consumers are affected because they don't use the `tool` field for logic (only for human-readable tracing).

---

### Decision 9: Documentation updates (BATCH-02 surface)

**Zed:** CLAUDE.md "Using The MCP From Claude Code" section gets a `generate_batch` example. AGENTS.md "What This MCP Provides" list gets `generate_batch` as a seventh tool. Keep both tight.

**Matt:** AGENTS.md `## Important Runtime Rules` should add one bullet: "generate_batch requires one approval for the full batch; failures are isolated per item and reported in the response." That's the key behavioral guarantee callers need to know.

**Decision:** 
- CLAUDE.md: add a `generate_batch` example in the "Using The MCP From Claude Code" section
- AGENTS.md: add `generate_batch` to tool list and add the batch failure isolation rule to Important Runtime Rules

---

### Decision 10: Plan count

**Zed:** Two plans: (1) core implementation — tool handler, batch executor, run manifest, type extensions, (2) documentation + tests. Tests in plan 1, docs in plan 2.

**Matt:** Tests belong in plan 1 alongside the implementation — they validate BATCH-04 (failure isolation) which is code behavior, not docs. Plan 2 is purely CLAUDE.md + AGENTS.md updates. That keeps the diff reviewable and matches the Phase 13 pattern.

**Decision:** 2 plans.
- `14-01-PLAN.md` — `generate_batch` tool handler, batch concurrency executor, manifest type extensions, unit tests for happy path + failure isolation + partial status
- `14-02-PLAN.md` — CLAUDE.md and AGENTS.md updates

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

**`resolveProvider()` in `src/index.ts` (lines 88-118):**
```typescript
function resolveProvider(requested, needsSize): { provider, providerName, sizeDropped? } | { error, providerName }
```
Handles: default provider lookup, size-capable fallback when no explicit provider given, explicit provider with size-incapable warning. Call this once per batch (batch-level provider), not per item.

**`resolveOutputPath()` in `src/utils/image.ts`:**
```typescript
resolveOutputPath({ outputPath?, outputDir?, assetId?, prompt, provider }): Promise<string>
```
Resolution order: explicit outputPath → outputDir+assetId → outputDir → default dir+assetId → default dir. Used per-item with `outputPath: item.outputPath, outputDir: batchOutputDir`.

**`saveImage()` in `src/utils/image.ts`:**
```typescript
saveImage(buffer: Buffer, filePath: string): Promise<string>
```
Atomic write via temp-file rename. Overwrites on collision.

**`buildEffectivePrompt()` in `src/index.ts` (line 120-122):**
```typescript
function buildEffectivePrompt(prompt: string, style?: string): string
```
Returns `style ? "${style}, ${prompt}" : prompt`. Reuse per-item.

**`createRunId()` and `resolveRunDir()` in `src/runs/`:**
- `createRunId()` — generates `run-<ISO>-<hex6>` ID
- `resolveRunDir(runId)` — creates `.runs/<runId>/` dir, validates path guard

**`writeManifest()` in `src/runs/manifest.ts`:**
- Takes `RunManifest` object, writes atomically to `manifest.json` in run dir
- Currently typed for `tool: 'image_op' | 'image_task'` — needs `'generate_batch'` added

**`RunManifest.status` type:** Currently `'in_progress' | 'success' | 'error'` — needs `'partial'` added.

**`RunManifestNode` in `src/runs/manifest.ts`:**
```typescript
interface RunManifestNode {
  id: string; op: string; provider: string; model?: string;
  artifactPath?: string; durationMs?: number;
  outcome?: 'success' | 'error' | 'skipped'; error?: string;
}
```
Each batch item becomes a `RunManifestNode` with `id: 'item-<index>'`, `op: 'generate'`, `provider`, `model`, `outcome`, `error`, `durationMs`.

### Tool Registration Pattern (from `src/index.ts`)

```typescript
server.tool(
  'generate_batch',
  '<description>',
  {
    items: z.array(z.object({
      prompt: z.string(),
      outputPath: z.string().optional(),
    })).min(1).max(50),
    provider: z.enum(['openai', 'gemini', 'replicate', 'together', 'grok']).optional(),
    style: z.string().optional(),
    size: z.enum(['square', 'landscape', 'portrait']).optional(),
    outputDir: z.string().optional(),
    max_concurrent: z.number().int().min(1).max(8).optional(),
  },
  handleGenerateBatch,
);
```

### generate_image handler reference (src/index.ts lines 157-224)
The per-item execution in `generate_batch` mirrors the `generate_image` handler:
1. `resolveProvider()` → get provider
2. `buildEffectivePrompt(item.prompt, style)` → effective prompt
3. `imageProvider.generate({ prompt: effectivePrompt, size })` → result buffer
4. `resolveOutputPath({ outputPath: item.outputPath, outputDir, prompt: item.prompt, provider: providerName })` → file path
5. `saveImage(result.buffer, filePath)` → write file
6. Build per-item result `{ index, success, path, provider, model, revisedPrompt }`

### Concurrency implementation (semaphore pattern)

The DAG executor in `src/task/dag-executor.ts` uses a ready-queue + `Promise.all()` with `MAX_PARALLEL_NODES = 2`. For `generate_batch`, use a simpler approach: a semaphore wrapper that dispatches tasks with `max_concurrent` slots. Since items are independent (no DAG dependencies), a flat concurrency-limited map is correct.

```typescript
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]>
```

Implemented by chunking tasks into windows of `limit` and using `Promise.allSettled()` per window — or use a proper semaphore with a queue. The chunk approach is simpler for independent tasks without DAG ordering.

### Existing VALID_PROVIDERS constant (src/index.ts line 68)
```typescript
const VALID_PROVIDERS: ProviderName[] = ['openai', 'gemini', 'replicate', 'together', 'grok'];
```
Reuse in `generate_batch` validation error messages.

### sizeDropped warning pattern (generate_image lines 194-197)
When `resolveProvider` returns `sizeDropped: true`, add a `warning` field to the response. For `generate_batch`, add the warning at the batch level (not per-item) since the provider is batch-scoped.

</code_context>

<specifics>
## Specific Ideas

### Handler sketch: `handleGenerateBatch`

```typescript
export async function handleGenerateBatch(args: GenerateBatchArgs): Promise<{
  content: Array<{ type: 'text'; text: string }>;
}> {
  const { items, provider, style, size, outputDir, max_concurrent = 3 } = args;
  const startedAt = Date.now();

  // 1. Resolve provider once for the batch
  const resolved = resolveProvider(provider, !!size);
  if ('error' in resolved) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: resolved.error }) }] };
  }
  const { provider: imageProvider, providerName, sizeDropped } = resolved;
  const effectiveSize = sizeDropped ? undefined : size;

  // 2. Create batch run ID and manifest
  const batchRunId = createRunId();
  const runDir = await resolveRunDir(batchRunId);
  await writeManifest(runDir, { /* in_progress */ });

  // 3. Build per-item tasks
  const tasks = items.map((item, index) => async () => {
    const itemStartedAt = Date.now();
    try {
      const effectivePrompt = buildEffectivePrompt(item.prompt, style);
      const result = await imageProvider.generate({ prompt: effectivePrompt, size: effectiveSize });
      const filePath = await resolveOutputPath({ outputPath: item.outputPath, outputDir, prompt: item.prompt, provider: providerName });
      await saveImage(result.buffer, filePath);
      return { index, success: true, path: filePath, provider: providerName, model: result.model, revisedPrompt: result.revisedPrompt, durationMs: Date.now() - itemStartedAt };
    } catch (error) {
      return { index, success: false, error: error instanceof Error ? error.message : String(error), provider: providerName, durationMs: Date.now() - itemStartedAt };
    }
  });

  // 4. Run with concurrency limit
  const settled = await runWithConcurrency(tasks, max_concurrent);

  // 5. Build manifest nodes and determine batch status
  const itemResults = settled.map((s) => s.status === 'fulfilled' ? s.value : { index: -1, success: false, error: 'Task threw unexpectedly' });
  const succeeded = itemResults.filter((r) => r.success).length;
  const failed = itemResults.filter((r) => !r.success).length;
  const batchStatus = failed === 0 ? 'success' : succeeded === 0 ? 'error' : 'partial';

  // 6. Write final manifest
  await writeManifest(runDir, { /* final manifest with nodes */ });

  // 7. Build response
  const response = { batchRunId, status: batchStatus, summary: { total: items.length, succeeded, failed }, items: itemResults.map(({ durationMs: _, ...r }) => r) };
  if (sizeDropped) response.warning = `Provider '${providerName}' does not support size parameter; size was ignored.`;
  return { content: [{ type: 'text', text: JSON.stringify(response) }] };
}
```

### `runWithConcurrency` implementation

Use chunked `Promise.allSettled` — simple and correct for independent tasks:

```typescript
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += limit) {
    const chunk = tasks.slice(i, i + limit);
    const chunkResults = await Promise.allSettled(chunk.map((t) => t()));
    results.push(...chunkResults);
  }
  return results;
}
```

This is O(items/limit) network round-trips and is the simplest correct implementation. A full semaphore queue would reduce idle time but adds complexity with no practical benefit at the expected batch sizes (2-50 items).

### Manifest type extensions (src/runs/manifest.ts)

```typescript
export interface RunManifest {
  // ...existing fields...
  status: 'in_progress' | 'success' | 'partial' | 'error';  // add 'partial'
  invocation: {
    tool: 'image_op' | 'image_task' | 'generate_batch';     // add 'generate_batch'
    // ...existing fields...
    batchItems?: Array<{ prompt: string; outputPath?: string }>;  // add
  };
}
```

### Unit tests to write

1. **Happy path**: 3 items, all succeed → `status: 'success'`, `summary.succeeded === 3`, each item has `success: true` and `path`
2. **Partial failure**: 3 items, middle one throws → `status: 'partial'`, `summary.failed === 1`, failing item has `success: false` with `error` string
3. **All fail**: all items throw → `status: 'error'`, `summary.succeeded === 0`
4. **Provider error (fatal)**: bad provider name → early error response, no run dir created
5. **Style propagation**: `style: "watercolor"` → each item prompt has style prepended
6. **outputDir routing**: top-level `outputDir` used when item has no `outputPath`
7. **Concurrency**: verify at most `max_concurrent` calls in flight simultaneously (use a counter in the mock)

Test file location: `src/index.test.ts` or a new `src/generate-batch.test.ts` — check existing test structure first; if `src/index.test.ts` exists, add there; otherwise create a focused file.

### CLAUDE.md example addition

Add to "Using The MCP From Claude Code" section (after existing `image_task` examples):

```text
Generate a batch of images in one approved call:
```
Then a structured example showing `items`, `provider`, `outputDir`.

### AGENTS.md updates

1. Add `generate_batch` to "What This MCP Provides" bullet list: `generate_batch — bulk text-to-image generation with one approval, per-item failure isolation, and a batch-scoped run artifact`
2. Add to "Important Runtime Rules": `generate_batch runs all items under one MCP approval. Per-item failures are isolated and reported inline; remaining items continue. Check response 'status' ('success'/'partial'/'error') and 'items' array for per-item outcomes.`

</specifics>

<deferred>
## Deferred Ideas

- **Per-item provider override** (BATCH-F01): allow each item to specify its own provider. Requires a more complex dispatch and potentially multiple `resolveProvider` calls. Deferred to a future phase.
- **Style seed / numeric seed** (BATCH-F02): deterministic reproducibility. No provider in the v1 set currently exposes a stable seed parameter consistently. Deferred.
- **`model` parameter**: could be added alongside `provider` but callers rarely use it in practice. Omit for now; can be added as a non-breaking extension later.
- **Streaming progress**: no way to stream intermediate results over MCP stdio; batch is synchronous. Any async/progress mechanism requires a different architecture.
- **Retry per item**: failed items could be retried once (like `runNodeWithRetry` does in the DAG executor). Omit for v2.1 — the caller can re-submit the failed items. Adding retry increases latency for transient-but-consistent failures.
- **Manifest per-item artifact storage**: items' PNGs could be mirrored under `.runs/<batchRunId>/item-0.png` for traceability. Omit — the manifest records the output path; that's sufficient for audit.
- **`generate_batch` via capability registry**: if a future milestone adds `image_task`-style routing to batch, the dispatch could go through the capability registry. Not now — premature abstraction.

</deferred>
