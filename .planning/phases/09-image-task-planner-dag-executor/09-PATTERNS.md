# Phase 9: image_task Planner + DAG Executor — Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 11 new + 3 extended (14 total)
**Analogs found:** 12 / 14

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `src/task/plan-schema.ts` | schema (zod) | request-response (validation) | `src/index.ts` lines 442-457 (`image_op` zod input schema) + `src/capabilities/types.ts` (Capability/Result types) | role-match |
| `src/task/planner.ts` | service (LLM client) | request-response | *no exact analog* — provider clients in `src/providers/openai.ts` (request-response API client) is the closest pattern | partial — provider clients (style only) |
| `src/task/plan-validator.ts` | validator | transform | `src/capabilities/validation.ts` (multi-pass param validator) | role-match |
| `src/task/dag-executor.ts` | service / orchestrator | event-driven (Kahn ready-queue) | `src/index.ts:handleImageOp` lines 520-794 (single-node invocation lifecycle) | role-match (1-node → N-node generalisation) |
| `src/task/ref-resolver.ts` | utility | transform | *no exact analog* — pure new (regex walk) | none |
| `src/task/best-partial.ts` | utility | transform (BFS) | *no exact analog* — pure new | none |
| `src/utils/path-input-root.ts` | utility (security) | transform | `src/runs/dir.ts:resolveRunDir` lines 19-35 (path-resolve + root containment check) + `src/utils/image.ts:expandTilde`/`resolveOutputPath` (tilde + path.resolve) | role-match (containment); needs `fs.realpath` upgrade |
| `src/runs/trace.ts` (extension) | type / builder | additive | itself (extend, do not replace) | exact (in-place) |
| `src/runs/manifest.ts` (extension) | type / writer | additive | itself (extend, do not replace) | exact (in-place) |
| `src/index.ts` (`image_task` registration + `handleImageTask`) | controller (MCP tool) | request-response | `src/index.ts` lines 440-465 (`image_op` registration), 520-794 (`handleImageOp`), 477-498 (`handleListCapabilities`) | exact |
| `src/task/serialize-response.ts` (base64 guard) | utility (response sanitizer) | transform | *no exact analog* — pure new; `imageOpErrorResponse` (lines 500-518) is the response-shape template | partial |
| `tests/task/*.test.ts` (7 unit) | test | — | `tests/capabilities/*.test.ts`, `tests/runs/*.test.ts` (existing Vitest layout) | exact |
| `tests/integration/image_task.*.test.ts` (4 integration) | test | — | `tests/integration/*.test.ts` (existing) | exact |

---

## Pattern Assignments

### `src/index.ts` (extension: `image_task` tool registration + `handleImageTask` orchestrator)

**Role:** controller (MCP tool entrypoint) — request-response.

**Analog:** `src/index.ts` lines 440-794 (existing `image_op` end-to-end).

#### Imports pattern (`src/index.ts` lines 1-39)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  CapabilityInvokeError,
  capabilityRegistry,
  registerBuiltInCapabilities,
  type CapabilityOp,
} from './capabilities/index.js';
import { validateCapabilityParams } from './capabilities/validation.js';
import {
  createRunId,
  resolveRunDir,
  nodeArtifactPath,
  writeFileAtomic,
  writeManifest,
  buildTraceNode,
  type RunManifest,
} from './runs/index.js';
import { resolveOutputPath, saveImage } from './utils/image.js';
```

Phase 9 adds: `import { handleImageTask } from './task/index.js';` plus `import Anthropic from '@anthropic-ai/sdk'` and `import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'` inside `src/task/planner.ts`.

#### Tool registration pattern (`src/index.ts` lines 440-457, the `image_op` shape to mirror exactly)

```typescript
server.tool(
  'image_op',
  'Invoke a registered image capability directly by operation and provider. ...',
  {
    op: z
      .enum(['extract_subject', 'edit_prompt', /* ... */])
      .describe('Capability operation. Use list_capabilities to see currently-registered ops.'),
    provider: z.string().describe('Capability provider (e.g., @imgly/local, openai, sharp, ...)'),
    params: z.record(z.unknown()).default({}).describe('Operation parameters. ...'),
    outputPath: z.string().optional().describe('Exact output file path (must end in .png). ...'),
    outputDir: z.string().optional().describe('Output directory ...'),
  },
  handleImageOp,
);
```

**Apply to `image_task`:** mirror this verbatim — tool call, top-level zod object schema (no enclosing `z.object()` — the SDK wraps), `.describe()` on every field, exported `handleImageTask` reference. Schema lives at lines 936-955 of RESEARCH.md §8.2.

#### Run-init + manifest preamble (`src/index.ts` lines 520-556)

Copy verbatim — this exact 4-step pattern (`createRunId` → `resolveRunDir` → write `in_progress` manifest → catch each step with `imageOpErrorResponse`):

```typescript
export async function handleImageOp(args: ImageOpArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { op, provider, params, outputPath, outputDir } = args;
  const startedAt = Date.now();
  const runId = createRunId();
  let runDir: string;

  try {
    runDir = await resolveRunDir(runId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return imageOpErrorResponse(runId, `Failed to create run directory: ${message}`);
  }

  const baseInvocation: RunManifest['invocation'] = {
    tool: 'image_op',  // → 'image_task' for Phase 9
    op, provider, params, outputPath, outputDir,
  };

  try {
    await writeManifest(runDir, {
      schemaVersion: 1, runId,
      startedAt: new Date(startedAt).toISOString(),
      status: 'in_progress',
      invocation: baseInvocation,
      nodes: [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return imageOpErrorResponse(runId, `Failed to write run manifest: ${message}`);
  }
```

**Adapt for `image_task`:** `baseInvocation.tool = 'image_task'`, drop `op`/`provider`/`params`/`outputPath`/`outputDir`, set `goal`/`inputImages`/`constraints` instead (per RESEARCH §6.2). Same try-around-each-step pattern.

#### Capability lookup, validation, invoke (`src/index.ts` lines 558-636)

This is the **single-node** lifecycle that the **DAG executor** generalises N-fold:

```typescript
const capability = capabilityRegistry.get(op as CapabilityOp, provider);
if (!capability) {
  // ... build errorNode via buildTraceNode, write manifest, return error envelope ...
}

const nodeId = '1';
const artifactPath = nodeArtifactPath(runDir, nodeId);

try {
  validateCapabilityParams(capability, params);
  const nodeStartedAt = Date.now();
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
    // ... writeManifest with finalOutput=filePath, return success envelope ...
  }

  if (result.kind === 'data') {
    // No artifact write; trace node has no artifactPath.
    const dataNode = buildTraceNode({ id: `n${nodeId}`, op, provider, model: result.model, startedAtMs: nodeStartedAt, endedAtMs: nodeEndedAt, outcome: 'success', metadata: result.metadata });
    // ... writeManifest, return { success: true, data: result.data, ... } ...
  }
}
```

**Apply to DAG executor (`src/task/dag-executor.ts`):** copy the **inside** of the try-block (validate, invoke, branch on `result.kind`, write artifact via `writeFileAtomic` + `nodeArtifactPath`, build trace node) into the `runNodeWithRetry` body in RESEARCH §5.4. Differences:
- Use `nodeArtifactPath(runDir, node.id)` for **every** node, not just the terminal.
- Only the **terminal** node calls `resolveOutputPath` + `saveImage` (per RESEARCH §5.6).
- Wrap `cap.invoke` in the retry-once loop (RESEARCH §5.4) — `image_op` does NOT retry.
- `cost_usd` flows from `node.costUsd` (plan estimate), not from a runtime measurement.
- `idempotencyKey` is derived: `` `${ctx.runId}:${node.id}` `` (per RESEARCH §5.4).

#### Error handling pattern (`src/index.ts` lines 731-793)

```typescript
} catch (error) {
  const endedAt = Date.now();
  const message = error instanceof Error ? error.message : String(error);
  const errorPayload =
    error instanceof CapabilityInvokeError
      ? { message, code: error.code, retryable: error.retryable, suggestion: error.suggestion }
      : { message };
  const errorNode = buildTraceNode({
    id: `n${nodeId}`, op, provider,
    startedAtMs: startedAt, endedAtMs: endedAt,
    outcome: 'error', error: message,
  });

  try {
    await writeManifest(runDir, {
      schemaVersion: 1, runId,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      status: 'error',
      invocation: baseInvocation,
      nodes: [{ id: errorNode.id, op, provider, outcome: 'error', error: message, durationMs: errorNode.durationMs }],
      totalDurationMs: errorNode.durationMs,
      error: message,
    });
  } catch (err) { /* fall through to imageOpErrorResponse with manifestError extra */ }

  return { content: [{ type: 'text' as const, text: JSON.stringify({
    success: false,
    error: errorPayload,         // ← discriminated CapabilityInvokeError fields lifted
    runId,
    trace: { runId, nodes: [errorNode] },
  }) }] };
}
```

**Apply to `image_task`:** the same `errorPayload` discriminator (`error instanceof CapabilityInvokeError → {code, retryable, suggestion}`) is the source for the per-node `errorDetail` field added in RESEARCH §6.1. Lift it from `runNodeWithRetry`'s catch into `traceNode.errorDetail`.

#### Error response helper (`src/index.ts` lines 500-518)

```typescript
function imageOpErrorResponse(
  runId: string,
  error: string | { message: string; code?: string; retryable?: boolean; suggestion?: string },
  nodes: ReturnType<typeof buildTraceNode>[] = [],
  extra: Record<string, unknown> = {},
): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: false,
        error: typeof error === 'string' ? { message: error } : error,
        runId,
        trace: { runId, nodes },
        ...extra,
      }),
    }],
  };
}
```

**Apply to `image_task`:** clone as `imageTaskErrorResponse` in `src/task/index.ts` with the same shape, plus an optional `extra.validation: PlanValidationFailure` field for plan-time errors (RESEARCH §6.3). Keep the same MCP `{ content: [{ type: 'text', text: JSON.stringify(...) }] }` envelope.

---

### `src/task/plan-schema.ts` (schema, zod)

**Role:** schema definition.
**Analog (style only):** `src/capabilities/types.ts` for discriminated unions; `src/index.ts` lines 444-456 for zod field-with-`.describe()` style.

**Imports pattern** (mirror `src/capabilities/types.ts` line 1-9):
```typescript
import { z } from 'zod';
```

**Discriminated-union pattern** (from `src/capabilities/types.ts` lines 73-89, `CapabilityInvokeResult`):
```typescript
export type CapabilityInvokeResult =
  | { kind: 'image'; buffer: Buffer; model: string; revisedPrompt?: string; metadata?: Record<string, unknown> }
  | { kind: 'data';  data: AnalyzeDimensionsResult | AnalyzePaletteResult | AnalyzeOcrResult; model: string; metadata?: Record<string, unknown> };
```

Apply to `outputKind: z.enum(['image', 'data'])` discriminator on `PlanNode` per RESEARCH §3.1. Plan-side may use `z.enum` since runtime values are string discriminators, not nested types.

**Per-op enum** (from `src/capabilities/types.ts` lines 1-9, `CapabilityOp`):
```typescript
export type CapabilityOp =
  | 'extract_subject' | 'edit_prompt' | 'composite_layers' | 'transform'
  | 'enhance_upscale' | 'analyze_dimensions' | 'analyze_palette' | 'analyze_ocr';
```

Apply to `op: z.enum([...same list...])` in `PlanNode` (RESEARCH §3.1). Keep the lists synchronised (single source of truth lives in `src/capabilities/types.ts`).

---

### `src/task/plan-validator.ts` (validator, transform)

**Role:** multi-pass validator.
**Analog:** `src/capabilities/validation.ts` (entire file, 115 lines).

**Imports pattern** (`src/capabilities/validation.ts` lines 1-3):
```typescript
import type { Capability } from './types.js';
const COMPOSITE_ANCHORS = new Set(['top-left', 'center', 'top-right', 'bottom-left', 'bottom-right']);
```

**Sequential-pass + throw-on-fail pattern** (`src/capabilities/validation.ts` lines 9-114) — note: existing code uses **first-error-fail per pass**, but the function is sequential pass-by-pass. RESEARCH §4.1 requires **collect-all** for some passes (refs/params/paths) and **first-error-fail** for others (cycle/budget/latency). Adapt the structure but switch to an accumulator for collect passes:

```typescript
// Existing (`src/capabilities/validation.ts` lines 9-23) — first-error-fail style:
export function validateCapabilityParams(capability: Capability, params: Record<string, unknown>): void {
  if (capability.constraints.requiresInputImage === true) {
    if (typeof params.input !== 'string' || params.input.trim().length === 0) {
      throw new Error(`${capability.op} requires params.input file path`);
    }
  }

  if (capability.op === 'edit_prompt') {
    if (typeof params.prompt !== 'string' || params.prompt.trim().length === 0) {
      throw new Error('edit_prompt requires params.prompt');
    }
  }
  // ... 12 more per-op blocks ...
}
```

**Re-use the function itself** in pass §4.1 step 8 (`validateCapabilityParams`) for per-node param validation — RESEARCH explicitly says "re-run `validateCapabilityParams(capability, resolvedParams)`" so the validator imports it directly. The plan-validator wraps it:

```typescript
// New: src/task/plan-validator.ts pass 8
import { validateCapabilityParams } from '../capabilities/validation.js';

for (const node of plan.nodes) {
  const cap = snapshot.find(c => c.op === node.op && c.provider === node.provider);
  if (!cap) continue;  // already collected in pass 7
  // Substitute refs with placeholder strings of correct shape so validator doesn't trip on '$inputs.X'
  const placeholderParams = substitutePlaceholders(node.params);
  try {
    validateCapabilityParams(cap, placeholderParams);
  } catch (err) {
    errors.push({ code: 'PARAM_INVALID', nodeId: node.id, message: (err as Error).message });
  }
}
```

**Constraint check pattern** (`src/capabilities/validation.ts` lines 96-114) — copy the exact "test constraint, throw with descriptive message including the offending value" style:

```typescript
if (
  capability.constraints.maxPromptLength !== undefined &&
  typeof params.prompt === 'string' &&
  params.prompt.length > capability.constraints.maxPromptLength
) {
  throw new Error(
    `${capability.op} prompt exceeds max length ${capability.constraints.maxPromptLength}`
  );
}
```

Apply to budget/latency cap checks (RESEARCH §4.1 passes 11-12) — message includes the cap, the actual, and the gap.

---

### `src/task/dag-executor.ts` (orchestrator, event-driven)

**Role:** Kahn-based DAG walker.
**Analog:** `src/index.ts:handleImageOp` lines 558-794 (single-node ⟶ N-node generalisation), `src/capabilities/registry.ts` lines 53-55 for `get()` calls.

The single-node lifecycle in `handleImageOp` (capability lookup → validate → invoke → branch on kind → write artifact → build trace node) is the **inner loop** of `dag-executor.execute()`. See full excerpt under "`src/index.ts` extension → Capability lookup, validation, invoke" above.

**Registry lookup pattern** (`src/capabilities/registry.ts` lines 53-55):
```typescript
get(op: CapabilityOp, provider: string): Capability | undefined {
  return this.capabilities.get(this.createKey(op, provider));
}
```

Apply per-node in `runNodeWithRetry`: `const cap = capabilityRegistry.get(node.op, node.provider);` — existence is **guaranteed** by validation pass 7, but defend with a `CAPABILITY_DISAPPEARED` error per RESEARCH §10.2.

**Per-node atomic artifact write** (`src/index.ts` line 628 + `src/runs/dir.ts` lines 37-42):
```typescript
// In handleImageOp:
const artifactPath = nodeArtifactPath(runDir, nodeId);
// ...
await writeFileAtomic(artifactPath, result.buffer);

// nodeArtifactPath in src/runs/dir.ts (verbatim):
export function nodeArtifactPath(runDir: string, nodeId: string): string {
  if (/[\\/]|\.\./.test(nodeId)) {
    throw new Error(`Invalid nodeId: '${nodeId}'`);
  }
  return path.join(runDir, `n${nodeId}.png`);
}
```

Apply for every image-producing node (RESEARCH §5.6). The nodeId-validation regex inside `nodeArtifactPath` is already strict (rejects `/`, `\`, `..`) — plan-validator's `PlanNode.id` regex `/^[A-Za-z_][A-Za-z0-9_-]{0,31}$/` is a strict subset, so the runtime check is defense-in-depth.

**Best-partial filename suffix** (RESEARCH §5.6 calls for `_partial` suffix): no existing analog — extend `resolveOutputPath` callers in `src/task/index.ts` to append `_partial` before `.png`:
```typescript
// Pattern derived from src/utils/image.ts:resolveOutputPath line 71-77
const finalPath = await resolveOutputPath({ outputPath, outputDir, prompt: plan.goal, provider: 'image_task' });
const partialPath = finalPath.replace(/\.png$/i, '_partial.png');
await saveImage(buffer, partialPath);
```

---

### `src/utils/path-input-root.ts` (utility, security)

**Role:** path containment check.
**Analog:** `src/runs/dir.ts:resolveRunDir` lines 19-35 + `src/utils/image.ts:expandTilde` lines 6-11.

**Tilde + path.resolve pattern** (`src/utils/image.ts` lines 6-11):
```typescript
function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}
```

Copy verbatim into `src/utils/path-input-root.ts` (RESEARCH §7.1 already uses this name).

**Containment-check pattern** (`src/runs/dir.ts` lines 19-35):
```typescript
export async function resolveRunDir(runId: string): Promise<string> {
  if (!isValidRunId(runId)) {
    throw new Error(`Invalid runId: '${runId}' does not match expected format`);
  }
  const root = await resolveRunsRoot();
  const runDir = path.join(root, runId);
  const resolvedRoot = path.resolve(root);
  const resolvedRunDir = path.resolve(runDir);

  if (!resolvedRunDir.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`runId resolved outside runs root: ${runId}`);
  }

  await fs.mkdir(runDir, { recursive: true });
  return runDir;
}
```

**Important upgrade for `path-input-root.ts`:** the analog uses `path.resolve` + `startsWith(resolvedRoot + path.sep)`. RESEARCH §7.1 explicitly **rejects this approach** for user-supplied paths because it does NOT defeat symlinks. Use `await fs.realpath(resolved)` instead, then the same `startsWith(root + path.sep)` boundary check. Pattern (RESEARCH §7.1):

```typescript
const resolved = path.resolve(expanded);     // collapses ..
const realPath = await fs.realpath(resolved); // resolves symlinks
const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
if (realPath !== root && !realPath.startsWith(rootWithSep)) {
  throw new InputPathOutsideRootError(inputPath, root);
}
```

The `_ + path.sep` boundary trick is **directly copied** from `src/runs/dir.ts:29`.

**Atomic write tmp-rename pattern** is already used twice in this codebase (`src/runs/write.ts:writeFileAtomic` and `src/utils/image.ts:saveImage` lines 109-114). The path-root utility doesn't write files, but any plan/planner-prose writers in `src/task/index.ts` must reuse `writeFileAtomic` per RESEARCH §5.6.

---

### `src/runs/trace.ts` (extension, additive)

**Role:** type extension + builder helper.
**Analog:** itself.

**Existing TraceNode** (`src/runs/trace.ts` lines 3-19):
```typescript
export interface TraceNode {
  id: string;
  op: CapabilityOp | string;
  provider: string;
  model?: string;
  artifactPath?: string;
  output?: string;
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  latencyMs: number;
  outcome: 'success' | 'error';
  error?: string;
  revisedPrompt?: string;
  cost_usd?: number;
  metadata?: Record<string, unknown>;
}
```

**Phase 9 extension (per RESEARCH §6.1):**
```typescript
export interface TraceNode {
  // ... all existing fields preserved ...
  outcome: 'success' | 'error' | 'skipped';                      // ADD 'skipped'
  inputRefs?: Array<{ field: string; ref: string; resolvedTo: string }>;  // NEW
  errorDetail?: { code: string; retryable: boolean; suggestion?: string }; // NEW (lift from CapabilityInvokeError)
  attempts?: number;                                             // NEW (1 or 2)
}

export interface Trace {
  runId: string;
  nodes: TraceNode[];
  skips?: Array<{ nodeId: string; blockedBy: string }>;          // NEW
}
```

**Builder pattern to preserve** (`src/runs/trace.ts` lines 42-61, `buildTraceNode`): extend `BuildTraceNodeInput` with the same 4 optional fields and pass them through. **Do not introduce a separate `buildDagTraceNode`** — single source of truth.

---

### `src/runs/manifest.ts` (extension, additive)

**Role:** type extension.
**Analog:** itself.

**Existing RunManifest** (`src/runs/manifest.ts` lines 15-33) — note `tool` already accepts `'image_task'`:
```typescript
export interface RunManifest {
  schemaVersion: 1;
  runId: string;
  startedAt: string;
  endedAt?: string;
  status: 'in_progress' | 'success' | 'error';
  invocation: {
    tool: 'image_op' | 'image_task';   // already supports image_task
    op: string;
    provider: string;
    params: Record<string, unknown>;
    outputPath?: string;
    outputDir?: string;
  };
  nodes: RunManifestNode[];
  finalOutput?: string;
  totalDurationMs?: number;
  error?: string;
}
```

**Phase 9 extension (per RESEARCH §6.2):** widen `invocation` to a discriminated union (or just add optional `goal` / `inputImages` / `constraints` and make `op`/`provider`/`params` optional too — simplest), and add top-level `plan?`, `planner?`, `totals?`, `bestPartial?`. Keep the writer (`writeManifest` lines 35-41) untouched — it just `JSON.stringify`s whatever shape it gets.

---

### `src/task/serialize-response.ts` (utility, sanitizer)

**Role:** base64/Buffer guard.
**Analog:** `src/index.ts` lines 500-518 (`imageOpErrorResponse` — response envelope shape only).

No existing analog for the **buffer-walk guard**. Implement per RESEARCH §6.5:
```typescript
function assertNoBuffers(value: unknown, path = '$'): void {
  if (Buffer.isBuffer(value)) throw new Error(`Buffer at ${path}`);
  if (typeof value === 'string' && value.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(value)) {
    throw new Error(`suspected base64 at ${path}`);
  }
  if (Array.isArray(value)) value.forEach((v, i) => assertNoBuffers(v, `${path}[${i}]`));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertNoBuffers(v, `${path}.${k}`);
  }
}
```

Same response envelope as `imageOpErrorResponse`: `{ content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }` — but call `assertNoBuffers(payload)` before `JSON.stringify`.

---

### `src/task/planner.ts` (LLM client)

**Role:** Anthropic SDK client wrapper.
**Analog:** *no existing analog in-repo.* Closest stylistic match is `src/providers/openai.ts` (request-response API client with env-var key + structured error handling), but the SDK shape is fundamentally different.

Use the verbatim pattern from RESEARCH §2.2:
```typescript
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { PlanSchema } from './plan-schema.js';

const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });

const message = await client.messages.parse({
  model: 'claude-haiku-4-5',
  max_tokens: 2048,
  temperature: 0,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userPrompt }],
  output_config: { format: zodOutputFormat(PlanSchema) },
});
const plan = message.parsed_output;
```

Error mapping pattern from RESEARCH §2.3 / §10.1 (PlannerError taxonomy: `PLANNER_AUTH`, `PLANNER_RATE_LIMIT`, `PLANNER_FAILURE`, `PLAN_PARSE_FAILED`).

**Stylistic refs from existing codebase:**
- Env-var fail-fast at first call (matches `OPENAI_API_KEY` pattern in `src/providers/openai.ts` and the project decision in RESEARCH Open Question §3).
- Structured error class with `code`/`retryable`/`suggestion` shape — directly mirrors `CapabilityInvokeError` (`src/capabilities/types.ts` lines 91-108):

```typescript
// Existing analog — copy this class shape for PlannerError:
export class CapabilityInvokeError extends Error {
  constructor(
    public readonly code: CapabilityInvokeErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly suggestion?: string,
  ) {
    super(message);
    this.name = 'CapabilityInvokeError';
  }
}
```

---

### `src/task/ref-resolver.ts` and `src/task/best-partial.ts`

**Role:** pure utilities.
**Analog:** none. Implement per RESEARCH §5.3 and §5.5 verbatim.

Stylistic choices to copy from existing codebase:
- Use plain `function` declarations, not classes (matches `src/utils/image.ts`, `src/runs/id.ts`).
- Throw plain `Error` for internal invariants; use `CapabilityInvokeError` only when re-throwing from inside `cap.invoke` (matches `src/capabilities/extract-subject.ts` line 35).
- Recursive object-walk pattern (RESEARCH §5.3) is novel — no existing analog uses recursive ref substitution.

---

### Tests (`tests/task/*.test.ts`, `tests/integration/image_task.*.test.ts`)

**Role:** Vitest 2.x unit + integration.
**Analog:** existing `tests/capabilities/`, `tests/runs/`, `tests/integration/` (Vitest layout already present).

**Apply existing convention:**
- File naming: `<module>.test.ts` mirrors `src/<dir>/<module>.ts`.
- Mock fixtures: place under `tests/fixtures/` (RESEARCH §9.5 calls out `tests/fixtures/product-small.png`).
- Mock Anthropic: shared helper at `tests/helpers/mockAnthropic.ts` (RESEARCH §9.5).
- Invoke-counter pattern for dry-run test (RESEARCH §9.3 criterion 2): wrap `capabilityRegistry.get` to increment a counter on `.invoke`.

---

## Shared Patterns

### Atomic file writes
**Source:** `src/runs/write.ts:writeFileAtomic` (lines 3-19) — already used by `writeManifest`, plus the inline tmp-rename in `src/utils/image.ts:saveImage` (lines 109-114).
**Apply to:** every file written by Phase 9 — per-node artifacts (`<runDir>/n<id>.png`), the new `<runDir>/plan.json`, the new `<runDir>/planner.txt`, the manifest, the user-facing terminal image, and the `_partial` fallback.
```typescript
export async function writeFileAtomic(filePath: string, data: Buffer | string): Promise<void> {
  const tmp = `${filePath}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, filePath);
  } catch (err) {
    try { await fs.unlink(tmp); } catch { /* best-effort */ }
    throw err;
  }
}
```

### Run-init preamble
**Source:** `src/index.ts:handleImageOp` lines 524-556.
**Apply to:** `handleImageTask` orchestrator. Same 4-step pattern: `createRunId` → `resolveRunDir` (with try/catch) → write `in_progress` manifest (with try/catch) → proceed.

### Structured-error → response payload mapping
**Source:** `src/index.ts:handleImageOp` lines 731-742 (the `errorPayload` ternary).
**Apply to:** every error path in `image_task` — both plan-time (PlannerError, validation errors) and execution-time (CapabilityInvokeError lifted from a node). Payload shape: `{ message, code?, retryable?, suggestion? }`.
```typescript
const errorPayload =
  error instanceof CapabilityInvokeError
    ? { message, code: error.code, retryable: error.retryable, suggestion: error.suggestion }
    : { message };
```

### Discriminated-union by `kind`
**Source:** `src/capabilities/types.ts` lines 73-89 (`CapabilityInvokeResult`).
**Apply to:** `PlanNode.outputKind`, `NodeState` (RESEARCH §5.1), executor success-output union (`{ kind: 'image' } | { kind: 'data' }`). Always switch on `kind` — never fall back to a nullable field.

### MCP response envelope
**Source:** `src/index.ts:handleImageOp` lines 673-683 (success), 605-615 (error).
**Apply to:** `handleImageTask`. Always:
```typescript
return {
  content: [{ type: 'text' as const, text: JSON.stringify({ /* payload */ }) }],
};
```

### `path.resolve` + boundary check (with `path.sep` suffix to avoid prefix collision)
**Source:** `src/runs/dir.ts:resolveRunDir` line 29.
**Apply to:** `assertWithinInputRoot` (RESEARCH §7.1) — but **upgrade `path.resolve` to `fs.realpath`** to defeat symlinks; keep the `+ path.sep` suffix trick verbatim (`/srv/data` must not match `/srv/data-public/...`).

### Top-of-invoke defensive check (per-capability)
**Source:** `src/capabilities/extract-subject.ts` lines 32-36 (the typeof+trim guard at the top of `invoke`):
```typescript
const filePath = input.params.input;
if (typeof filePath !== 'string' || !filePath.trim()) {
  throw new CapabilityInvokeError('CONSTRAINT_VIOLATION', 'extract_subject requires params.input file path', false);
}
```
**Apply to:** add `await assertWithinInputRoot(filePath)` immediately after this guard in **all 8 capability files** (RESEARCH §7.3). One-line addition per file:
- `src/capabilities/extract-subject.ts`
- `src/capabilities/edit-prompt.ts`
- `src/capabilities/transform.ts`
- `src/capabilities/composite-layers.ts` (loop over `params.layers[].input`)
- `src/capabilities/enhance-upscale.ts`
- `src/capabilities/analyze-dimensions.ts`
- `src/capabilities/analyze-palette.ts`
- `src/capabilities/analyze-ocr.ts`

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/task/planner.ts` | LLM client | request-response | No prior Anthropic-SDK or LLM-client code in this repo. Provider clients (`src/providers/openai.ts`) call **image** APIs, not chat-completion APIs, and don't use structured outputs. Use RESEARCH §2 patterns directly. |
| `src/task/ref-resolver.ts` | regex-based string substitution | transform | No prior recursive-object-walk-with-ref-substitution in repo. RESEARCH §5.3 has the canonical implementation; copy verbatim. |
| `src/task/best-partial.ts` | BFS over DAG | transform | No prior graph-traversal code in repo. RESEARCH §5.5 has the canonical BFS-from-terminal implementation. |
| `src/task/serialize-response.ts` (the buffer-walk) | response sanitizer | transform | No prior buffer/base64 guard in repo. RESEARCH §6.5 has it. |

For these files, the planner should treat RESEARCH §2/§5.3/§5.5/§6.5 as authoritative and rely on the shared patterns above (structured errors, atomic writes, MCP envelope) for everything else.

---

## Metadata

**Analog search scope:**
- `src/index.ts` (handleImageOp + tool registration patterns)
- `src/capabilities/*.ts` (validation, types, registry, one cap example)
- `src/runs/*.ts` (trace, manifest, dir, id, write)
- `src/utils/image.ts` (resolveOutputPath, saveImage, expandTilde)

**Files scanned:** 11 source files (≈1,560 lines of analog code read).

**Analog quality summary:**
- Exact analog (in-place extension): 3 files (`src/runs/trace.ts`, `src/runs/manifest.ts`, `src/index.ts`).
- Role-match analog: 4 files (`plan-validator`, `dag-executor`, `path-input-root`, `plan-schema`).
- Partial analog (style only): 2 files (`planner`, `serialize-response`).
- No analog (pure new): 3 files (`ref-resolver`, `best-partial`, plus the buffer-walk inside `serialize-response`).

**Pattern extraction date:** 2026-05-02
