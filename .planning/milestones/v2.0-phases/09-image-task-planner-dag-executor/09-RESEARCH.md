# Phase 9: image_task Planner + DAG Executor — Research

**Researched:** 2026-05-02
**Domain:** LLM-driven JSON DAG planning, deterministic DAG execution, capability routing, plan/trace symmetry
**Confidence:** HIGH (SDK + capability layer verified in-repo; planner architecture verified against Anthropic docs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Plan contract and validation**
- **D-01:** Strict, explicit JSON DAG plan. No vague "previous result" references.
- **D-02:** Each node has stable `id`, `op`, `provider`, `params`, `dependsOn`, declared output/reference shape, estimated `costUsd`, estimated `latencyMs`, optional `reason`.
- **D-03:** References are explicit and machine-checkable: `$inputs.product`, `$nodes.extract.output`.
- **D-04:** Code validates the plan. Unregistered `(op, provider)` → invalid. Failed param validation → invalid. No best-effort execution of malformed plans.
- **D-05:** Plan schema is the durable execution contract. Must support Phase 10 concurrency without changing shape.

**Routing and budget**
- **D-06:** Hard constraints enforced in code: registered caps, cap constraints, I/O compatibility, budget cap, latency cap, param validation.
- **D-07:** Haiku chooses among legal routes from `list_capabilities`; code verifies before execution.
- **D-08:** Quality scores influence routing only when present; trace must show whether routing was measured-quality-driven.
- **D-09:** `constraints.budget_cap_usd` is a hard plan-time gate. Fail before any provider call.
- **D-10:** Routing policy: hard constraints → measured quality → cost → latency → deterministic/local.

**DAG executor and failure semantics**
- **D-11:** Small DAG executor, not a workflow engine.
- **D-12:** Topological execution; mostly sequential in P9 but executor must not block P10 parallelism.
- **D-13:** Node-level try/catch. Retry once only for `CapabilityInvokeError` with `retryable: true`.
- **D-14:** If a node fails, downstream nodes whose deps cannot be satisfied are skipped, not attempted.
- **D-15:** Best partial result = latest successful image-producing node nearest the intended terminal output. Data-only nodes never count as final output.
- **D-16:** Structured `CapabilityInvokeError` fields (`code`, `retryable`, `suggestion`) flow into trace.

**Trace and artifact contract**
- **D-17:** Trace is a stable debugging API; MCP response is compact and path-only.
- **D-18:** MCP response includes `runId`, `output` when available, `total_cost_usd`, `total_latency_ms`, validated plan summary, per-node trace details.
- **D-19:** Per-node details: status, op, provider, model, input refs/artifact refs, output artifact path or data result, cost, latency, `revisedPrompt` when present, structured error details on failure.
- **D-20:** No base64 image data in `image_task` responses or trace.
- **D-21:** Richer audit trail under `.runs/<runId>/manifest.json`.
- **D-22:** Plan and trace schemas aligned: plan = "what should happen"; trace = "what actually happened."

**Scope boundaries**
- **D-23:** No template fast-paths in P9 (P10 owns).
- **D-24:** No broad executor parallelism in P9 (minimal concurrency only if trivial).
- **D-25:** No new providers in P9.

**Security**
- **D-26:** Add optional `IMAGE_GEN_INPUT_ROOT` validation for all capability input fields (Phase 8 deferred backlog).
- **D-27:** When set, all input paths must resolve under that root and reject `..` traversal + outside-symlinks.

### Claude's Discretion
- Exact module layout for planner, validator, executor, `image_task` registration.
- Exact Zod schemas (must enforce locked plan and trace contracts).
- Exact prompt wording for Haiku (must emit only validated JSON, use registry metadata).
- Exact representation of terminal/final node (best-partial selection must be deterministic and testable).
- Exact manifest internals beyond stable MCP response fields.

### Deferred Ideas (OUT OF SCOPE)
- Template fast-paths and planner skipping — Phase 10.
- Broad bounded executor parallelism / per-backend concurrency budgets — Phase 10.
- New providers / expanded capability breadth — Phase 11.
- Cross-run cost dashboards — out of scope for v2.0.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TASK-01 | `image_task` MCP tool accepts `{goal, input_images?, constraints?}` | §8 MCP registration plan; tool input schema sketch |
| TASK-02 | `constraints` accepts `{output_size, output_format, quality_tier, budget_cap_usd, latency_cap_seconds, style_refs}` | §8 constraints zod schema |
| TASK-03 | Planner (Haiku) emits JSON Plan validated against capability registry | §2 SDK specifics (`messages.parse` + `zodOutputFormat`); §3 plan schema; §4 validation pipeline |
| TASK-04 | `dry_run: true` returns Plan without executing | §8 dry_run handler returns post-validation plan; never reaches executor |
| TASK-05 | `budget_cap_usd` enforced at plan time; hard fail with clear error if exceeded | §4 budget pass produces `BudgetCapExceededError` with `estimated_cost`/`cap` |
| TASK-06 | DAG executor walks plan; independent nodes run concurrently (libvips capped at 2) | §5 Kahn's-based ready queue; D-24 keeps P9 sequential, but executor topology supports P10 parallelism |
| TASK-07 | Per-node try/catch; on failure, save best partial result and surface error in trace | §5 best-partial-result algorithm; node-level retry-once on retryable |
| TASK-08 | Response includes `{output, runId, trace, total_cost_usd, total_latency_ms}` with per-node detail | §6 trace/manifest extension; §8 output schema |
| TASK-09 | Trace returns paths only, never base64 | §6 base64 guard pattern; §8 response serializer rejects buffers |
| TASK-10 | `revisedPrompt` from generate nodes surfaces in trace | §6 already on `TraceNode`; populated from `CapabilityInvokeResult.revisedPrompt` |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tagged unions over discriminated booleans** — plan node `kind` and ref types must be discriminated unions, not nullable fields.
- **PNG-only output** — image artifacts emitted by capabilities are PNG; the response contract must remain PNG-only.
- **Atomic writes (tmp + rename)** — already implemented in `src/runs/write.ts:writeFileAtomic`. Reuse for any new artifact paths.
- **Path priority** — `outputPath > outputDir > IMAGE_GEN_OUTPUT_DIR > ~/Downloads/generated-images` (preserved by reusing `resolveOutputPath`).
- **Defensive programming** — null checks, guard clauses, no silent fallback. Errors should propagate with structured detail.
- **No silent provider fallback** — established in Phase 1; `image_task` may *plan* alternatives, but execution does not silently switch providers post-validation.
- **Vitest 2.x** is the test framework; tests live under `tests/`, mirroring source layout (`tests/capabilities/`, `tests/integration/`, `tests/runs/`).

## 1. Summary

Phase 9 wires together five concerns: (1) a JSON DAG plan emitted by Haiku 4.5, (2) deterministic in-code validation against the live capability registry, (3) a small Kahn's-style topological executor with one-retry-on-retryable semantics, (4) a path-only MCP response with a richer on-disk manifest, and (5) optional `IMAGE_GEN_INPUT_ROOT` path validation closing the planner-widened threat surface.

The Anthropic TypeScript SDK already provides first-class structured-output helpers (`client.messages.parse({ output_config: { format: zodOutputFormat(schema) } })`), removing the need for a defensive JSON parser. Use these helpers — they're more reliable than tool-use-with-tool_choice or prompt-only JSON mode for the schema sizes involved here, and they collapse the three-step "request → parse → validate" into one validated call.

The plan/trace duality is the load-bearing design choice: the same node IDs, the same shape, with status fields added on the trace side. This makes dry-run trivially the "validated plan only" branch, and keeps Phase 10's template fast-paths drop-in compatible.

**Primary recommendation:** Use `@anthropic-ai/sdk@^0.92.0`, model `claude-haiku-4-5`, the `messages.parse()` + `zodOutputFormat()` helpers, a Kahn's-algorithm executor with explicit `pending → ready → running → success | error | skipped` node states, and add a single `pathInputRoot.ts` utility used both by plan validation and (defensively) inside each capability that reads input paths.

---

## 2. SDK / Library Specifics

### 2.1 Anthropic SDK [VERIFIED: npm view @anthropic-ai/sdk version → 0.92.0, modified 2026-04-30]

| Item | Value | Source |
|------|-------|--------|
| Package | `@anthropic-ai/sdk` | npm registry |
| Version | `^0.92.0` (current 2026-04-30) | npm view |
| Model ID | `claude-haiku-4-5` (alias) or `claude-haiku-4-5-20251001` (pinned) | [CITED: Claude API Pricing 2026] |
| Pricing | $1.00 input / $5.00 output per 1M tokens | [CITED: BenchLM, finout.io] |
| Context window | 200K tokens | [CITED: pricepertoken.com] |
| Best-fit prompt | Plan schema is "flat-ish" with ~6-8 top-level fields per node; ~97-98% first-pass reliability via tool/structured-output mode | [VERIFIED: WebSearch, structured outputs benchmarks] |

**Add to `package.json` deps:** `"@anthropic-ai/sdk": "^0.92.0"` — already on the STATE.md "Pending Todos" list.

### 2.2 Forcing JSON-only output: use `messages.parse` + `zodOutputFormat`

The SDK ships a structured-outputs helper that bypasses prompt-engineered JSON mode. This is the right tool for Phase 9.

```typescript
// Source: Context7 /anthropics/anthropic-sdk-typescript helpers.md (verified 2026-05-02)
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { PlanSchema } from './plan-schema.js';  // see §3

const client = new Anthropic({
  // apiKey reads from ANTHROPIC_API_KEY by default
  timeout: 30_000,        // 30s — Haiku is fast; long timeout indicates a real problem
  maxRetries: 1,          // SDK does its own backoff for 429/5xx; 1 extra retry is enough
});

const message = await client.messages.parse({
  model: 'claude-haiku-4-5',
  max_tokens: 2048,        // typical plan: 200-600 tokens; 2048 leaves headroom
  system: SYSTEM_PROMPT,   // see §2.4
  messages: [{ role: 'user', content: userPrompt }],
  output_config: {
    format: zodOutputFormat(PlanSchema),
  },
});

const plan = message.parsed_output;  // typed as z.infer<typeof PlanSchema>
```

**Why this over alternatives:**

| Approach | Verdict |
|----------|---------|
| `messages.parse` + `zodOutputFormat` (above) | **Recommended.** Schema enforced server-side; SDK validates with Zod on receive; one round-trip. [VERIFIED: SDK helpers.md] |
| Tool use with `tool_choice: {type: 'tool', name: 'emit_plan'}` | Workable but more code. Useful for multi-tool flows; overkill for "always emit one schema." |
| Prompt-only JSON mode ("respond with JSON") | **Avoid.** Drift, markdown fences, trailing commas, occasional pre/post-amble. Brittle for a load-bearing contract. |

**Reliability note:** [CITED: tessl.io / unpromptedmind, 2025-2026] structured outputs are GA on Haiku 4.5; flat schemas <8 fields land at ~97-98% first-pass. Our plan schema is nested (nodes contain refs/params), so add a defensive try/catch around `messages.parse` and surface a clear `PLAN_PARSE_FAILED` error to the user — do not retry silently (cost spike risk).

### 2.3 Error classes

```typescript
// Source: Context7 /anthropics/anthropic-sdk-typescript llms.txt
import Anthropic from '@anthropic-ai/sdk';

try {
  const message = await client.messages.parse(...);
} catch (error) {
  if (error instanceof Anthropic.APIError) {
    if (error instanceof Anthropic.RateLimitError)        { /* 429 */ }
    if (error instanceof Anthropic.AuthenticationError)   { /* 401 — bad ANTHROPIC_API_KEY */ }
    if (error instanceof Anthropic.BadRequestError)       { /* 400 — schema rejected */ }
    // error.status is the HTTP status; error.message is human-readable
  }
}
```

Map planner errors into a stable shape for the MCP response:
- `AuthenticationError` → `{ code: 'PLANNER_AUTH', message: 'ANTHROPIC_API_KEY missing or invalid' }`
- `RateLimitError` → `{ code: 'PLANNER_RATE_LIMIT', retryable: true }`
- Other `APIError` → `{ code: 'PLANNER_FAILURE', retryable: error.status >= 500 }`
- Zod parse failure on `parsed_output` → `{ code: 'PLAN_PARSE_FAILED', issues: [...] }`

### 2.4 System prompt strategy

Construct the planner system prompt **at request time** from a fresh `capabilityRegistry.list()` snapshot (not a cached one — see Pitfall §10.2). Suggested structure:

```
You are an image-task planner. Produce ONE JSON DAG that achieves the user's goal
using ONLY the capabilities listed below. Reference inputs as $inputs.<key> and
intermediate outputs as $nodes.<id>.output. Do NOT invent capabilities.

Available capabilities (op, provider, modelVersion, cost, latencyMsP50, quality):
<JSON of list_capabilities output>

Routing policy:
- Prefer measured quality when present; otherwise prefer lower cost, then lower latency,
  then deterministic/local providers.
- Honor constraints.budget_cap_usd: estimated total cost MUST be <= cap.
- Honor constraints.latency_cap_seconds: estimated cumulative latency on the longest path
  MUST be <= cap (sum sequential, max parallel).

The user's goal will follow.
```

The user message contains: `goal`, `input_images` (with logical names like `product`, `background`), and `constraints`. Optional `seed` to make Haiku output more stable across reruns (note: Anthropic does not currently expose a `seed` parameter; use temperature 0 instead).

**Token cost estimate:** A typical plan call with 8 capabilities listed = ~800-1200 input tokens, ~300-500 output tokens. At Haiku 4.5 pricing this is ~$0.001-0.003 per call — matches the v2.0 architectural assumption.

### 2.5 Surfacing reasoning vs the plan

Haiku may include reasoning before the JSON. With `messages.parse` + `zodOutputFormat`, the SDK extracts the structured payload separately from any prose. The prose lives in `message.content` content blocks of type `text`. **Capture and discard** the prose for the MCP response (D-20 path-only response), but **persist it to the manifest** under `manifest.planner.reasoning` so debugging an unexpected plan is possible.

Per-node planner reasoning is captured separately via the optional `reason?: string` field on each plan node (D-02). The planner can populate this; the executor copies it through to the trace node verbatim.

---

## 3. Plan Schema (Zod)

### 3.1 Concrete shape

Recommended layout at `src/task/plan-schema.ts`:

```typescript
import { z } from 'zod';

// Reference primitives ------------------------------------------------------

const InputRef = z.string().regex(/^\$inputs\.[A-Za-z_][A-Za-z0-9_]*$/, {
  message: 'must be $inputs.<name>',
});

const NodeRef = z.string().regex(/^\$nodes\.[A-Za-z_][A-Za-z0-9_]*\.output$/, {
  message: 'must be $nodes.<id>.output',
});

// A param value can be a literal, a ref, or a structure of those.
// Strings that LOOK like refs but don't match are treated as literals
// (the validator double-checks unresolved refs at validation time, §4.2).
const PlanRef = z.union([InputRef, NodeRef]);

// Per-op param schemas mirror src/capabilities/validation.ts.
// Use z.record(z.unknown()) at the boundary, validate per-op below.
const PlanNodeParams = z.record(z.unknown());

// Plan node -----------------------------------------------------------------

const PlanNode = z.object({
  id: z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]{0,31}$/),
  op: z.enum([
    'extract_subject', 'edit_prompt', 'composite_layers', 'transform',
    'enhance_upscale', 'analyze_dimensions', 'analyze_palette', 'analyze_ocr',
  ]),
  provider: z.string().min(1),
  params: PlanNodeParams,
  dependsOn: z.array(z.string()).default([]),

  // Output declaration: needed for ref-type-compatibility check (image vs data)
  outputKind: z.enum(['image', 'data']),

  // Estimates from the planner (verified by the validator against registry)
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().nonnegative(),

  // Optional planner reasoning for trace
  reason: z.string().max(500).optional(),
});

// Plan ----------------------------------------------------------------------

export const PlanSchema = z.object({
  version: z.literal(1),                // bump if schema changes
  goal: z.string(),                     // echoed back so trace stays useful
  nodes: z.array(PlanNode).min(1).max(32),
  terminalNodeId: z.string(),           // explicit terminal; supports best-partial fallback
  estimatedTotalCostUsd: z.number().nonnegative(),
  estimatedTotalLatencyMs: z.number().nonnegative(),
  routingNotes: z.array(z.object({
    nodeId: z.string(),
    measuredQuality: z.boolean(),       // D-08: trace must show whether quality scores were used
    rationale: z.string().max(200),
  })).optional(),
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanNodeT = z.infer<typeof PlanNode>;
```

**Design notes:**
- **Single terminal (D-15 friendly):** `terminalNodeId` is a single string, not an array. If the plan has parallel branches, only one is the declared terminal; the others are exploratory. Keeps best-partial selection deterministic.
- **`outputKind` is declared not inferred:** the validator cross-checks against the registry's capability output kind. Mismatch → invalid plan. This is what makes type-compatible ref resolution (§4.2) tractable.
- **Per-op param shape lives in `validateCapabilityParams`, not the Zod schema:** mirroring the existing `image_op` pattern (line-by-line cap-specific checks). Keeping params as `z.record(z.unknown())` at the schema boundary avoids duplicating capability constraint logic.
- **No `seed` in the plan:** seeds are an executor-time concern (idempotencyKey, §5.4), not a plan-time concern.

### 3.2 Reference resolution rules

A param value of type `string` is treated as a reference iff it matches one of the regexes:
- `$inputs.<name>` → `input_images[<name>]` (a file path provided by the user)
- `$nodes.<id>.output` → the success output of node `<id>`:
  - if that node's `outputKind === 'image'`, resolves to its **artifact path** (`.runs/<runId>/n<id>.png`)
  - if that node's `outputKind === 'data'`, resolves to its **structured `data`** object (e.g., `AnalyzeDimensionsResult`)

Substitution happens in the executor (§5.3), not the validator. The validator only checks **shape** and **target existence + type compatibility**.

### 3.3 Cycle detection / topological sort

Use **Kahn's algorithm** ([CITED: Wikipedia, USACO Guide, geeksforgeeks.org]). It's simpler than DFS-based, naturally yields a "ready queue" the executor can drain (§5.1), and naturally extends to bounded parallelism in P10:

```typescript
// Source: Kahn's algorithm — Wikipedia / USACO Guide
function topologicalSort(nodes: PlanNodeT[]): { order: string[]; cycle: string[] | null } {
  const indegree = new Map<string, number>(nodes.map(n => [n.id, 0]));
  const adjacency = new Map<string, string[]>(nodes.map(n => [n.id, []]));

  for (const node of nodes) {
    for (const depId of node.dependsOn) {
      adjacency.get(depId)!.push(node.id);
      indegree.set(node.id, indegree.get(node.id)! + 1);
    }
  }

  const ready: string[] = [];
  for (const [id, deg] of indegree) if (deg === 0) ready.push(id);

  const order: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const nextId of adjacency.get(id)!) {
      const newDeg = indegree.get(nextId)! - 1;
      indegree.set(nextId, newDeg);
      if (newDeg === 0) ready.push(nextId);
    }
  }

  if (order.length !== nodes.length) {
    // Surviving nodes form (or contain) a cycle
    const cycle = [...indegree.entries()].filter(([_, d]) => d > 0).map(([id]) => id);
    return { order: [], cycle };
  }
  return { order, cycle: null };
}
```

Cycle → invalid plan, structured error `PLAN_CYCLE_DETECTED` listing offending node IDs.

### 3.4 Terminal node policy

A plan with multiple "leaf" nodes (no dependents) is allowed but:
- exactly one must be marked `terminalNodeId` and it MUST have `outputKind === 'image'` (TASK-08 requires a final image path on success)
- if the planner emits a plan whose terminal is a `data` node, the validator rejects it with `TERMINAL_MUST_BE_IMAGE`

This makes `output` in the response unambiguous and ensures D-15 best-partial selection has a clear target (§5.5).

---

## 4. Validation Pipeline

The validation pipeline runs in a strict order. **First-error-fail** for structural errors (schema, refs, cycles); **collect-all-errors** for capability-level errors (params, costs, paths) so the user gets one report instead of N retries.

### 4.1 Order of passes

Implement as a function `validatePlan(plan: Plan, ctx: ValidationContext): ValidatedPlan` in `src/task/plan-validator.ts`:

| # | Pass | Failure mode | Error code |
|---|------|--------------|-----------|
| 1 | **Schema** — Zod parse | first-error-fail (handled by `messages.parse` upstream) | `PLAN_PARSE_FAILED` |
| 2 | **Reference shape** — every param string matching `^\$` is a valid `$inputs.X` or `$nodes.X.output` | collect | `PLAN_INVALID_REF` |
| 3 | **Reference target existence** — `$inputs.X` exists in `input_images`; `$nodes.X.output` matches a node in `plan.nodes` | collect | `PLAN_UNKNOWN_REF` |
| 4 | **Reference type compatibility** — image-input params receive image refs; data-input params receive data refs (per-op rules, §4.3) | collect | `PLAN_REF_TYPE_MISMATCH` |
| 5 | **DAG acyclicity** — Kahn's; also enforces all `dependsOn` IDs exist | first-error-fail | `PLAN_CYCLE_DETECTED` / `PLAN_UNKNOWN_DEP` |
| 6 | **Terminal policy** — `terminalNodeId` exists, has `outputKind === 'image'`, no orphan branches (warn, do not fail) | first-error-fail | `TERMINAL_INVALID` |
| 7 | **Capability existence** — for each node, `capabilityRegistry.get(op, provider)` returns a Capability | collect | `CAPABILITY_NOT_REGISTERED` |
| 8 | **Param validation** — call existing `validateCapabilityParams(capability, params)` for each node, **after substituting refs with placeholder values** of the right shape (e.g., `'<runtime-image-path>'` for image refs) so cap validators don't trip on the ref token | collect | `PARAM_INVALID` |
| 9 | **Input path policy** — for every literal string under any `*input` or `layers[].input` field, run `assertWithinInputRoot()` (§7) when `IMAGE_GEN_INPUT_ROOT` is set | collect | `INPUT_PATH_OUTSIDE_ROOT` |
| 10 | **Cost aggregation** — recompute `totalCost = sum(node.costUsd)`; cross-check Haiku's `estimatedTotalCostUsd` is within ±20% (warn-only, log to manifest); the **recomputed** sum is what gates the budget cap | warn | `COST_ESTIMATE_DRIFT` |
| 11 | **Budget cap** — `recomputedTotalCost <= constraints.budget_cap_usd`. If exceeded: hard fail with `{ code: 'BUDGET_CAP_EXCEEDED', estimated_cost_usd, cap_usd, gap_usd }` | first-error-fail | `BUDGET_CAP_EXCEEDED` |
| 12 | **Latency cap** — longest-path (critical-path) latency `<= constraints.latency_cap_seconds * 1000`. Sum sequential, take max across parallel branches | first-error-fail | `LATENCY_CAP_EXCEEDED` |

### 4.2 Why first-error-fail vs collect-all

- Structural errors (schema/cycle/terminal) are usually one-shot — no point listing 12 sub-errors that all stem from a malformed JSON.
- Capability-level errors (refs, params, paths) genuinely come in clusters — surface all of them so the planner LLM can fix in one round, OR (more usefully) so a human reading the dry-run output sees the full picture.
- Budget cap is first-error-fail because it's the success-criterion gate (TASK-05) and exposing a single clear `BUDGET_CAP_EXCEEDED` is cleaner than burying it under N other warnings.

### 4.3 Per-op type-compatibility matrix

| Op | Image-input fields | Data-input fields |
|----|--------------------|-------------------|
| `extract_subject` | `params.input` | — |
| `edit_prompt` | `params.input` | — |
| `transform` | `params.input` | — (`operations` is a literal array) |
| `composite_layers` | `params.layers[].input` | — (`canvas` is literal) |
| `enhance_upscale` | `params.input` | — |
| `analyze_dimensions` | `params.input` | — |
| `analyze_palette` | `params.input` | — |
| `analyze_ocr` | `params.input` | — |

All current capabilities consume image-typed inputs at known field locations. Validator can statically enumerate. **No capability currently consumes a data-typed input** — analyze ops only emit data — but Phase 9's plan schema must already accept data-output refs because Phase 10/11 may compose them (e.g., a future `compose_with_palette` cap reading an `analyze_palette` result).

### 4.4 Error report shape

Return a structured error envelope:

```typescript
interface PlanValidationFailure {
  ok: false;
  errors: Array<{
    code: string;
    message: string;
    nodeId?: string;
    field?: string;        // dotted path, e.g. 'params.layers[1].input'
    suggestion?: string;   // human-actionable hint
  }>;
  // Plan-time aggregates the user might still want to see:
  plan?: Plan;             // echo the plan back even on failure
  estimated_cost_usd?: number;
  budget_cap_usd?: number;
}
```

Then the MCP response simply embeds this under `error.validation` for plan-time failures.

---

## 5. DAG Executor

### 5.1 Algorithm (Kahn's, drained as a ready queue)

State per node:

```typescript
type NodeState =
  | { status: 'pending' }
  | { status: 'ready' }
  | { status: 'running'; startedAtMs: number }
  | { status: 'success'; output: ImageOutput | DataOutput; node: TraceNode }
  | { status: 'error';   error: ExecutionError;            node: TraceNode }
  | { status: 'skipped'; blockedBy: string };  // dep failed/skipped

type ImageOutput = { kind: 'image'; artifactPath: string };
type DataOutput  = { kind: 'data';  data: AnalyzeDimensionsResult | AnalyzePaletteResult | AnalyzeOcrResult };
```

Pseudocode (`src/task/dag-executor.ts`):

```typescript
async function execute(plan: Plan, ctx: ExecCtx): Promise<ExecResult> {
  const states = new Map<string, NodeState>(plan.nodes.map(n => [n.id, { status: 'pending' }]));
  const indegree = computeIndegree(plan);              // mutable copy
  const adjacency = computeAdjacency(plan);
  const ready: string[] = plan.nodes.filter(n => n.dependsOn.length === 0).map(n => n.id);

  while (ready.length > 0) {
    const id = ready.shift()!;
    const node = plan.nodes.find(n => n.id === id)!;
    states.set(id, { status: 'running', startedAtMs: Date.now() });

    let outcome: NodeState;
    try {
      const params = resolveRefs(node.params, plan, states, ctx.inputs);  // §5.3
      outcome = await runNodeWithRetry(node, params, ctx);                // §5.4
    } catch (err) {
      outcome = makeErrorState(node, err);
    }
    states.set(id, outcome);

    if (outcome.status === 'success') {
      // decrement downstream indegrees, push ready
      for (const downstreamId of adjacency.get(id) ?? []) {
        indegree.set(downstreamId, indegree.get(downstreamId)! - 1);
        if (indegree.get(downstreamId) === 0) ready.push(downstreamId);
      }
    } else {
      // skip downstream transitively (BFS over adjacency, all reachable)
      const blocked = transitiveDownstream(id, adjacency);
      for (const blockedId of blocked) {
        if (states.get(blockedId)!.status === 'pending') {
          states.set(blockedId, { status: 'skipped', blockedBy: id });
        }
      }
    }
  }

  return summarize(plan, states);   // §5.5
}
```

**Why Kahn's:** the ready queue *is* the parallelism interface. Phase 10 just needs to drain `ready` with `Promise.all` instead of `await sequentially`, capped by a per-backend semaphore. Phase 9 ships single-shift sequential.

### 5.2 Per-node lifecycle

1. Resolve refs in `node.params` (§5.3) — fails with `EXEC_REF_RESOLVE` if a referenced node is in `error`/`skipped` state (should not happen because of indegree gating, but defend anyway).
2. Pre-flight: re-run `validateCapabilityParams(capability, resolvedParams)` (cheap; defense-in-depth — a literal might be present that wasn't checkable at plan time).
3. Pre-flight path: run `assertWithinInputRoot()` on every resolved file path (§7).
4. `await capability.invoke({ params: resolvedParams, idempotencyKey: deriveKey(runId, node.id) })`.
5. On `kind === 'image'`:
   - write buffer atomically to `<runDir>/n<node.id>.png` via `nodeArtifactPath` + `writeFileAtomic` (existing utilities).
   - if this is the terminal node: also save to user-facing path via `resolveOutputPath` + `saveImage`.
6. On `kind === 'data'`: no artifact write; trace `artifactPath` is `null`.
7. Build trace node (use existing `buildTraceNode`); attach `cost_usd` from `node.costUsd`, `revisedPrompt` from result, `metadata` from result.
8. Persist to in-memory `states`.

### 5.3 Reference substitution

```typescript
function resolveRefs(
  params: Record<string, unknown>,
  plan: Plan,
  states: Map<string, NodeState>,
  inputs: Record<string, string>,  // input_images logical-name → file path
): Record<string, unknown> {
  // Recursive walk; substitute strings that match the ref regexes.
  // Arrays and nested objects are walked transparently.
  const visit = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const inputMatch = /^\$inputs\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(value);
      if (inputMatch) {
        const path = inputs[inputMatch[1]];
        if (!path) throw new Error(`Unknown input '${inputMatch[1]}'`);
        return path;
      }
      const nodeMatch = /^\$nodes\.([A-Za-z_][A-Za-z0-9_]*)\.output$/.exec(value);
      if (nodeMatch) {
        const ref = states.get(nodeMatch[1]);
        if (!ref || ref.status !== 'success') {
          throw new Error(`Cannot resolve $nodes.${nodeMatch[1]}.output: node not successful`);
        }
        if (ref.output.kind === 'image') return ref.output.artifactPath;
        return ref.output.data;
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v)]));
    }
    return value;
  };
  return visit(params) as Record<string, unknown>;
}
```

### 5.4 One-retry-on-retryable

```typescript
async function runNodeWithRetry(
  node: PlanNodeT,
  resolvedParams: Record<string, unknown>,
  ctx: ExecCtx,
): Promise<SuccessState | ErrorState> {
  const cap = capabilityRegistry.get(node.op, node.provider)!;   // existence checked at validation
  const baseInput = {
    params: resolvedParams,
    idempotencyKey: `${ctx.runId}:${node.id}`,
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await cap.invoke(baseInput);
      // success path: build success state
      return buildSuccess(node, result, ctx);
    } catch (err) {
      const isRetryable = err instanceof CapabilityInvokeError && err.retryable === true;
      if (attempt === 1 && isRetryable) continue;   // ONE retry only
      // on second attempt or non-retryable: bubble up
      return buildError(node, err, attempt);
    }
  }
  /* unreachable */ throw new Error('unreachable');
}
```

**Critical:** validation errors (Zod parse, ref resolution, etc.) are NOT routed through `runNodeWithRetry`. Only `CapabilityInvokeError` thrown inside `cap.invoke` is eligible. Other thrown errors are non-retryable by design.

### 5.5 Best partial result selection (deterministic)

Run after all nodes have terminated:

```typescript
function pickBestPartialResult(plan: Plan, states: Map<string, NodeState>): { artifactPath?: string; nodeId?: string } {
  // 1. If terminal succeeded, that IS the result.
  const terminal = states.get(plan.terminalNodeId);
  if (terminal?.status === 'success' && terminal.output.kind === 'image') {
    return { artifactPath: terminal.output.artifactPath, nodeId: plan.terminalNodeId };
  }

  // 2. Otherwise, walk dependency chain backwards from the terminal,
  //    BFS through dependsOn, return the first successful image-producing node.
  const visited = new Set<string>();
  const queue: string[] = [plan.terminalNodeId];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = plan.nodes.find(n => n.id === id);
    if (!node) continue;
    const state = states.get(id);
    if (state?.status === 'success' && state.output.kind === 'image') {
      return { artifactPath: state.output.artifactPath, nodeId: id };
    }
    queue.push(...node.dependsOn);
  }

  // 3. Nothing in the terminal chain succeeded. Return undefined.
  return {};
}
```

**Why this is deterministic:** BFS over `dependsOn` from the declared terminal yields a stable order. "Nearest to terminal" = lowest BFS depth from terminal. If two image-producing nodes are at the same depth, BFS visits them in the order they appear in the terminal's `dependsOn` array (planner-controlled), not in topological order — predictable from the plan alone. Test this with a forced-failure fixture (§9).

**Edge case:** the terminal itself is a `data` node (caught at validation, but defend at runtime too) → no best partial; return `{}` and the response has no `output` field.

### 5.6 Where to write intermediate artifacts

| Artifact | Location | Mechanism |
|----------|----------|-----------|
| Per-node image artifacts | `<runDir>/n<node.id>.png` | `nodeArtifactPath()` + `writeFileAtomic()` (existing) |
| Final user-facing image (terminal success) | `resolveOutputPath()` rules | `saveImage()` (existing — atomic) |
| Best-partial image (terminal failed) | Same as above, but with a `_partial` suffix in the filename | New helper: append before `.png` |
| Manifest | `<runDir>/manifest.json` | `writeManifest()` (existing — atomic) |
| Plan | `<runDir>/plan.json` | New: `writeFileAtomic()` |
| Planner reasoning (prose) | `<runDir>/planner.txt` | New: `writeFileAtomic()` (only if non-empty) |

**No need to invent a new `intermediates/` subdir** — the existing per-node layout under `<runDir>/n<id>.png` already serves this purpose, and Phase 6 retention sweep already handles cleanup. Adding a subdir would require updating the retention sweep.

---

## 6. Trace / Manifest Extension

### 6.1 Reuse existing `TraceNode` — no new type needed

The current `TraceNode` (`src/runs/trace.ts`) already includes:
`id, op, provider, model?, artifactPath?, output?, startedAtMs, endedAtMs, durationMs, latencyMs, outcome, error?, revisedPrompt?, cost_usd?, metadata?`

For Phase 9 we need to add three optional fields and one status state:

```typescript
// Extend TraceNode:
interface TraceNode {
  // ... existing fields ...
  outcome: 'success' | 'error' | 'skipped';                          // ADD 'skipped'
  inputRefs?: Array<{ field: string; ref: string; resolvedTo: string }>;  // NEW (D-19 input refs)
  errorDetail?: { code: string; retryable: boolean; suggestion?: string }; // NEW (structured error from CapabilityInvokeError)
  attempts?: number;                                                 // NEW (1 or 2)
}
```

Add a new `Trace` field listing skipped node IDs and the failure that caused each skip — useful for the trace consumer:

```typescript
interface Trace {
  runId: string;
  nodes: TraceNode[];
  skips?: Array<{ nodeId: string; blockedBy: string }>;
}
```

This keeps `image_op` traces backward-compatible (they never produce `skipped` or `attempts`).

### 6.2 Manifest extensions

`RunManifest` in `src/runs/manifest.ts` already accepts `tool: 'image_op' | 'image_task'`. Extend `RunManifest` for `image_task`:

```typescript
interface RunManifest {
  // ... existing fields ...
  invocation: {
    tool: 'image_op' | 'image_task';
    // For 'image_task':
    goal?: string;
    inputImages?: Record<string, string>;
    constraints?: TaskConstraints;
    // For 'image_op' (existing):
    op?: string;
    provider?: string;
    params?: Record<string, unknown>;
    outputPath?: string;
    outputDir?: string;
  };
  plan?: Plan;                                          // full plan (D-21)
  planner?: {                                           // NEW
    model: string;                                      // 'claude-haiku-4-5'
    promptTokens?: number;
    completionTokens?: number;
    costUsd?: number;
    latencyMs: number;
    reasoning?: string;                                 // prose from message.content text blocks
    skipped: boolean;                                   // Phase 10 sets true for template fast-path
  };
  totals?: {                                            // NEW
    estimatedCostUsd: number;
    estimatedLatencyMs: number;
    actualCostUsd: number;
    actualLatencyMs: number;
  };
  bestPartial?: { nodeId: string; artifactPath: string }; // NEW (only set when terminal failed)
}
```

### 6.3 Compact MCP response shape

Per D-18..D-21, the MCP response shape:

```typescript
type ImageTaskResponse =
  | {
      success: true;
      output?: string;                      // path to terminal image, or best-partial path
      bestPartial?: { nodeId: string; path: string };  // present iff terminal failed but a partial exists
      runId: string;
      total_cost_usd: number;
      total_latency_ms: number;
      plan: PlanSummary;                    // see §6.4
      trace: Trace;                         // path-only TraceNode[], no buffers
    }
  | {
      success: false;
      error: {
        code: string;
        message: string;
        validation?: PlanValidationFailure;  // for plan-time errors (TASK-05 budget cap lives here)
        nodeId?: string;                      // for execution-time errors
      };
      runId: string;
      // Even on failure, include whatever ran:
      trace: Trace;
      total_cost_usd?: number;
      total_latency_ms?: number;
    };
```

### 6.4 PlanSummary (compact, for the response)

The full plan goes to the manifest. The response gets a slim summary:

```typescript
interface PlanSummary {
  version: 1;
  goal: string;
  terminalNodeId: string;
  estimatedTotalCostUsd: number;
  estimatedTotalLatencyMs: number;
  nodes: Array<{
    id: string;
    op: string;
    provider: string;
    dependsOn: string[];
    outputKind: 'image' | 'data';
    costUsd: number;
    latencyMs: number;
    reason?: string;
  }>;
}
```

Drop `params` from the summary — they can be 100s of bytes per node and the manifest has the full version. Trace nodes carry `inputRefs` (resolved paths), which is what consumers actually need to reason about flow.

### 6.5 Base64 guard pattern

To enforce D-20 (no base64 in responses), wrap the response serializer:

```typescript
// src/task/serialize-response.ts
function assertNoBuffers(value: unknown, path = '$'): void {
  if (value === null || value === undefined) return;
  if (Buffer.isBuffer(value)) {
    throw new Error(`Response serialization invariant violated: Buffer at ${path}`);
  }
  if (typeof value === 'string' && value.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(value)) {
    // Heuristic: a long base64-looking string. Block it.
    throw new Error(`Response serialization invariant violated: suspected base64 at ${path}`);
  }
  if (Array.isArray(value)) value.forEach((v, i) => assertNoBuffers(v, `${path}[${i}]`));
  else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value!)) assertNoBuffers(v, `${path}.${k}`);
  }
}

export function serializeImageTaskResponse(resp: ImageTaskResponse): string {
  assertNoBuffers(resp);
  return JSON.stringify(resp);
}
```

Hook into a unit test (§9) that builds a fake response with a `buffer` and asserts the serializer throws.

---

## 7. `IMAGE_GEN_INPUT_ROOT` Path Validation

### 7.1 Single utility, used at both layers

Create `src/utils/path-input-root.ts`:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

function expandTilde(p: string): string {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

function resolveOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^\$\{[^}]+\}$/.test(trimmed)) return undefined;
  return trimmed;
}

let cachedRoot: string | null | undefined;  // undefined = not checked, null = unset

export async function getInputRoot(): Promise<string | null> {
  if (cachedRoot !== undefined) return cachedRoot;
  const raw = resolveOptionalEnv(process.env.IMAGE_GEN_INPUT_ROOT);
  if (!raw) { cachedRoot = null; return null; }
  // Resolve through realpath so the env var itself can be a symlink without surprises
  cachedRoot = path.resolve(await fs.realpath(expandTilde(raw)));
  return cachedRoot;
}

export function clearInputRootCache(): void { cachedRoot = undefined; }  // for tests

export class InputPathOutsideRootError extends Error {
  constructor(public readonly inputPath: string, public readonly root: string) {
    super(`Input path '${inputPath}' resolves outside IMAGE_GEN_INPUT_ROOT='${root}'`);
    this.name = 'InputPathOutsideRootError';
  }
}

/**
 * Resolves `inputPath` (handling tilde, relative paths, and symlinks) and asserts
 * the resolved real path is under the configured input root.
 *
 * If IMAGE_GEN_INPUT_ROOT is not set, this is a no-op.
 *
 * NOTE: Uses fs.realpath on the input. This both (a) defeats `..` traversal AND
 * (b) defeats symlinks pointing outside the root, because realpath resolves
 * symlinks before comparison. fs.realpath throws if the file doesn't exist —
 * which is the right behavior for capability inputs (they must exist) but
 * means callers should ensure the file is on disk before validating (it always
 * is for plan-time validation against `input_images` and intermediate paths
 * since intermediates are written before any downstream node reads them).
 */
export async function assertWithinInputRoot(inputPath: string): Promise<void> {
  const root = await getInputRoot();
  if (!root) return;

  const expanded = expandTilde(inputPath);
  const resolved = path.resolve(expanded);     // collapses ..
  let realPath: string;
  try {
    realPath = await fs.realpath(resolved);    // resolves symlinks
  } catch (err) {
    // File missing: treat as outside-root to avoid TOCTOU on planner-emitted paths
    throw new InputPathOutsideRootError(inputPath, root);
  }
  // Compare with trailing-separator boundary to avoid prefix collision
  // (root='/srv/data' must not match '/srv/data-public/foo')
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (realPath !== root && !realPath.startsWith(rootWithSep)) {
    throw new InputPathOutsideRootError(inputPath, root);
  }
}
```

**Why `fs.realpath` instead of just `path.resolve` + `startsWith`:** the latter does NOT defeat symlinks. A symlink `/srv/data/escape -> /etc` would pass a string-prefix check while reading an attacker-controlled file. `realpath` resolves the symlink then we compare the real target. (`src/runs/dir.ts:resolveRunDir` uses the simpler `startsWith` because it controls the directory itself; for *user-supplied* paths we need realpath.)

### 7.2 All capability `*input` field locations

Per D-26 / Phase 8 backlog T-08-02-01 (verified by grep across `src/capabilities/`):

| Capability | Input field path | Notes |
|------------|------------------|-------|
| `extract_subject` | `params.input` | string |
| `edit_prompt` | `params.input` | string |
| `transform` | `params.input` | string |
| `composite_layers` | `params.layers[].input` | array — each element |
| `enhance_upscale` | `params.input` | string |
| `analyze_dimensions` | `params.input` | string |
| `analyze_palette` | `params.input` | string |
| `analyze_ocr` | `params.input` | string |

**Total: 8 capabilities, 1 array-typed field, 7 scalar fields.**

### 7.3 Where to apply validation: BOTH layers

| Layer | Why | When |
|-------|-----|------|
| **Plan-time (preferred)** | Catches errors before any provider call; clean error for the caller; failure is the planner's mistake, not a runtime crash. | Validation pass §4.1 step 9. Walks plan params, finds string fields whose path matches the table above, calls `assertWithinInputRoot`. |
| **Capability-time (defense in depth)** | A capability called via `image_op` (not `image_task`) has no plan-time validation. Capabilities must self-protect. | At the top of each capability's `invoke()`, before `fs.readFile`. Add a single call: `await assertWithinInputRoot(filePath)`. |

A simple module-level injection (one-line addition per capability) avoids surprises later. Tests check both paths.

### 7.4 Intermediate artifact paths

`<runDir>/n<id>.png` is generated by the executor itself — these are NOT user-supplied paths. They MUST be exempt from root validation, OR the executor must ensure `<runDir>` itself is under the root. Simplest answer: only validate paths whose origin is `$inputs.X` (user-supplied) or a string literal in the plan params (planner-supplied). Paths that came from `$nodes.X.output` are intermediate-artifact paths controlled by us — skip them.

Implementation hook: `resolveRefs` (§5.3) tags each resolved path with its origin (`'input' | 'node-output' | 'literal'`); the validator only runs `assertWithinInputRoot` on `'input' | 'literal'`.

---

## 8. MCP Tool Registration Plan

### 8.1 New file: `src/task/index.ts` (orchestrator)

Wires planner → validator → executor → response builder.

```typescript
export async function handleImageTask(args: ImageTaskArgs): Promise<McpResponse> {
  const startedAt = Date.now();
  const runId = createRunId();
  const runDir = await resolveRunDir(runId);
  // 1. Snapshot capabilities (immutable for this request — Pitfall §10.2)
  const snapshot = capabilityRegistry.list();
  // 2. Plan (or skip in dry_run-no-plan corner case? No: dry_run STILL plans, just doesn't execute)
  const plan = await planTask({ goal: args.goal, inputs: args.input_images ?? {}, constraints: args.constraints, snapshot });
  // 3. Validate
  const v = await validatePlan(plan, { snapshot, inputs: args.input_images ?? {}, constraints: args.constraints });
  if (!v.ok) return planFailureResponse(runId, v);
  // 4. Persist plan
  await writeFileAtomic(path.join(runDir, 'plan.json'), JSON.stringify(plan, null, 2));
  // 5. dry_run short-circuit
  if (args.dry_run) return dryRunResponse(runId, plan);
  // 6. Execute
  const result = await executeDag(plan, { runId, runDir, inputs: args.input_images ?? {}, snapshot });
  // 7. Manifest + response
  await writeManifest(runDir, buildManifest(/* ... */));
  return executionResponse(runId, plan, result, startedAt);
}
```

### 8.2 Tool registration in `src/index.ts`

Mirror the existing `image_op` registration:

```typescript
server.tool(
  'image_task',
  'Hand off a natural-language image goal and receive a final image plus structured trace. The MCP server plans a DAG over registered capabilities (use list_capabilities to inspect them), validates it against budget/latency caps, and executes node-by-node. Returns paths only -- never base64 image data. Use dry_run: true to inspect the planned DAG before executing.',
  {
    goal: z.string().min(1).describe('Natural-language description of the desired output image (e.g., "remove background and place on white studio surface, 2000px square").'),
    input_images: z.record(z.string()).optional().describe('Logical-name -> absolute path map (e.g., {"product": "/path/to/photo.jpg"}). Referenced from the plan as $inputs.<name>.'),
    constraints: z.object({
      output_size: z.enum(['square', 'landscape', 'portrait']).optional(),
      output_format: z.literal('png').optional(),
      quality_tier: z.enum(['fast', 'balanced', 'best']).optional(),
      budget_cap_usd: z.number().nonnegative().optional().describe('Hard plan-time gate. Plan exceeds cap -> error before any provider call.'),
      latency_cap_seconds: z.number().nonnegative().optional(),
      style_refs: z.array(z.string()).optional(),
    }).optional(),
    dry_run: z.boolean().optional().default(false).describe('Validate and return the plan without executing.'),
    seed: z.number().int().optional().describe('Reserved for executor-time idempotency; planner uses temperature 0 for determinism.'),
  },
  handleImageTask,
);
```

### 8.3 Module layout

```
src/task/
├── index.ts            # handleImageTask orchestrator
├── plan-schema.ts      # Zod schemas (Plan, PlanNode, refs)
├── planner.ts          # Anthropic SDK client + prompt construction
├── plan-validator.ts   # 12-pass validation pipeline
├── dag-executor.ts     # Kahn-based topological executor
├── ref-resolver.ts     # $inputs.X / $nodes.X.output substitution
├── best-partial.ts     # selectBestPartialResult
├── serialize-response.ts # path-only enforcement (§6.5)
└── prompts.ts          # SYSTEM_PROMPT, capability-snapshot serializer

src/utils/
└── path-input-root.ts  # assertWithinInputRoot, getInputRoot

tests/task/
├── plan-schema.test.ts
├── plan-validator.test.ts
├── dag-executor.test.ts
├── ref-resolver.test.ts
├── best-partial.test.ts
└── path-input-root.test.ts
tests/integration/
├── image_task.smoke.test.ts        # extract -> composite -> transform with mock provider
├── image_task.dry_run.test.ts      # TASK-04
├── image_task.budget.test.ts       # TASK-05 / criterion 3
└── image_task.failure.test.ts      # TASK-07 / criterion 4 forced node failure
```

---

## 9. Validation Architecture (used by Nyquist)

`workflow.nyquist_validation` is presumed enabled (no `.planning/config.json` examined to override). Include this section so Nyquist can promote it to VALIDATION.md.

### 9.1 Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 |
| Config file | `vitest.config.ts` (verified in repo) |
| Quick run command | `npx vitest run tests/task tests/integration/image_task` |
| Full suite command | `npm test` |

### 9.2 Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TASK-01 | `image_task` accepts `{goal, input_images?, constraints?}` | unit (zod schema) | `npx vitest run tests/task/plan-schema.test.ts -t "tool input"` | ❌ Wave 0 |
| TASK-02 | `constraints` schema accepts all six fields | unit | `npx vitest run tests/task/plan-schema.test.ts -t "constraints"` | ❌ Wave 0 |
| TASK-03 | Planner emits Plan validated against registry; ref shape, capability existence, ref type compatibility all checked | integration (mock Anthropic) | `npx vitest run tests/integration/image_task.smoke.test.ts` | ❌ Wave 0 |
| TASK-04 | `dry_run: true` returns Plan without executing; mock provider counter stays 0 | integration | `npx vitest run tests/integration/image_task.dry_run.test.ts` | ❌ Wave 0 |
| TASK-05 | `budget_cap_usd: 0.005` against an over-budget plan → `BUDGET_CAP_EXCEEDED` with `estimated_cost_usd` and `cap_usd` | integration | `npx vitest run tests/integration/image_task.budget.test.ts` | ❌ Wave 0 |
| TASK-06 | Topological execution; independent nodes can run concurrently (P9 may keep sequential — assert the executor's ready queue can hold >1) | unit | `npx vitest run tests/task/dag-executor.test.ts -t "ready queue"` | ❌ Wave 0 |
| TASK-07 | Forced node failure → trace identifies failed node, response includes best-partial result (or empty if none earlier) | integration | `npx vitest run tests/integration/image_task.failure.test.ts` | ❌ Wave 0 |
| TASK-08 | Response shape includes `output, runId, trace, total_cost_usd, total_latency_ms` with per-node detail | integration (snapshot) | `npx vitest run tests/integration/image_task.smoke.test.ts -t "response shape"` | ❌ Wave 0 |
| TASK-09 | Response/trace contain no base64 — serializer guard rejects buffers | unit | `npx vitest run tests/task/serialize-response.test.ts` | ❌ Wave 0 |
| TASK-10 | `revisedPrompt` from a generate-class node surfaces in trace | integration (mock provider returns `revisedPrompt`) | `npx vitest run tests/integration/image_task.smoke.test.ts -t "revisedPrompt"` | ❌ Wave 0 |

### 9.3 ROADMAP Success Criteria → Validation Strategy

Each ROADMAP §"Phase 9" criterion maps to falsifiable tests:

| # | Criterion | Strategy |
|---|-----------|----------|
| 1 | `image_task({goal, input_images: ['/path/to/product.jpg']})` returns `extract_subject → composite_layers → transform` trace and a final image path | **Integration test** with mock Anthropic SDK returning a fixed plan + real local capabilities (`extract_subject` is local via @imgly; `composite_layers` and `transform` are sharp-local). Fixture image: a small known PNG under `tests/fixtures/`. Assert: response has `success: true`, `output` ends in `.png`, `trace.nodes.length === 3`, ops are exactly `extract_subject, composite_layers, transform` in topological order. |
| 2 | `dry_run: true` returns Plan without executing | **Integration test.** Replace `capabilityRegistry.get(...)` with a wrapper that increments a counter on `invoke`. Assert counter remains 0; assert response has `plan` and no `output`. |
| 3 | `constraints.budget_cap_usd: 0.005` against an over-budget plan returns hard error at plan time | **Integration test.** Mock planner returns a plan with two `enhance_upscale` nodes (perMegapixelUsd=0.0023 × MP > $0.005). Run validator. Assert `error.code === 'BUDGET_CAP_EXCEEDED'`, `error.validation.estimated_cost_usd > 0.005`, `error.validation.cap_usd === 0.005`, and the mock invoke counter is 0. |
| 4 | Mid-execution node failure → trace identifies failed node, response includes best partial | **Integration test.** Plan: `n1: extract_subject → n2: edit_prompt → n3: transform` with `n3` as terminal. Stub the registry's `edit_prompt.invoke` to throw `new CapabilityInvokeError('PROVIDER_FAILURE', '...', false)`. Run executor. Assert: `n1.outcome === 'success'`, `n2.outcome === 'error'`, `n3.outcome === 'skipped'`, response has `bestPartial.nodeId === 'n1'` and `bestPartial.path` ends in `n1.png`. |
| 5 | Trace contains `cost_usd`, `latency_ms`, `revisedPrompt` (when present), and saved artifact paths — never base64 | **Unit test on serializer + snapshot test on trace.** Build a synthetic `Trace` with a fake `Buffer` field and assert `serializeImageTaskResponse` throws. Run the smoke test (criterion 1) and snapshot the trace shape; the snapshot regex-matches every `artifactPath` against `\.png$` and asserts no field starts with `data:image` or matches `^[A-Za-z0-9+/=]{1000,}$`. |

### 9.4 Sampling rate

- **Per task commit:** `npx vitest run tests/task tests/integration/image_task` (target: <10s on local).
- **Per wave merge:** `npm test` (full suite — Phase 9's tests plus all prior phases).
- **Phase gate:** Full suite green before `/gsd-verify-work`.

### 9.5 Wave 0 gaps

All Phase 9 tests must be created; nothing pre-exists. Wave 0 work:

- [ ] `tests/task/plan-schema.test.ts` — covers TASK-01, TASK-02, plan-shape edge cases (cycle, missing terminal, multiple terminals)
- [ ] `tests/task/plan-validator.test.ts` — all 12 passes, error envelope shape, COST_ESTIMATE_DRIFT warn behavior
- [ ] `tests/task/dag-executor.test.ts` — Kahn's order, retry-once-on-retryable, ref resolution, skip-transitive-downstream
- [ ] `tests/task/ref-resolver.test.ts` — `$inputs.X`, `$nodes.X.output`, nested object/array walk, error on missing ref
- [ ] `tests/task/best-partial.test.ts` — terminal succeeds, terminal fails with image-producing dep, terminal fails with only data-producing deps, no successful image at all
- [ ] `tests/task/path-input-root.test.ts` — env unset (no-op), `..` traversal blocked, symlink-out blocked, allowed path passes, missing file rejected, prefix-collision blocked (`/srv/data` vs `/srv/data-public`)
- [ ] `tests/task/serialize-response.test.ts` — Buffer detection, base64 heuristic, allowed shapes pass
- [ ] `tests/integration/image_task.smoke.test.ts` — TASK-01 / criterion 1 (real local caps + mock Anthropic)
- [ ] `tests/integration/image_task.dry_run.test.ts` — TASK-04 / criterion 2 (invoke-counter pattern)
- [ ] `tests/integration/image_task.budget.test.ts` — TASK-05 / criterion 3 (budget envelope)
- [ ] `tests/integration/image_task.failure.test.ts` — TASK-07 / criterion 4 (forced failure, best-partial)
- [ ] `tests/helpers/mockAnthropic.ts` — shared mock client returning a specified Plan; isolates planner cost/network from tests
- [ ] `tests/fixtures/product-small.png` — small known fixture for integration tests (or generate via sharp at test setup, mirroring Phase 7 pattern)

No new framework install required (Vitest 2.x already present).

---

## 10. Pitfalls & Open Risks

### 10.1 LLM JSON parsing edge cases

The `messages.parse` helper handles markdown fences and trailing text by extracting the structured payload separately. Still: **wrap the call in try/catch** and treat any parse exception as a hard `PLAN_PARSE_FAILED` error to the user. Do NOT retry silently — Haiku is cheap but a runaway retry loop in a personal tool is annoying and burns budget. Surface the issue and let the user retry explicitly. (Mitigation: log the raw response text to `<runDir>/planner-raw.txt` for debugging.)

### 10.2 Capability metadata drift between snapshot and runtime

**The risk:** the planner sees `list_capabilities()` at request entry. By the time the executor runs, theoretically a capability could be unregistered (in this server that requires re-registration on startup, but defensive code is cheap). More relevant: the planner's snapshot is sent over the wire to Anthropic and could be stale by even a few ms on a multi-request server.

**Mitigation:** snapshot the registry once at the start of `handleImageTask` and pass that snapshot through the entire pipeline (planner → validator → executor). Validator re-checks against the *snapshot*, not the live registry. Executor calls `capabilityRegistry.get(op, provider)` live just-in-time before each `invoke` — if the cap disappeared, that's a structured `CAPABILITY_DISAPPEARED` error in the trace (treat as non-retryable). In the personal-tool single-process world this is paranoia; design for it anyway because it costs ~5 lines.

### 10.3 Race conditions on `.runs/<runId>/` writes (Phase 10 forward-looking)

Phase 9 is mostly sequential — no race. But the manifest is written multiple times (in_progress at start, success/error at end). Phase 10's parallel executor will write per-node manifest snapshots concurrently. **Recommendation for Phase 9:** continue the existing `image_op` pattern of "write in_progress, then write final" — single-writer per request, no contention. Document as a Phase 10 follow-up that per-node manifest patches need a serializer (e.g., a single async-mutex around `writeManifest`).

### 10.4 Hidden cost spikes from planning over too many capabilities

Each plan request sends the full `list_capabilities` snapshot in the system prompt. With 8 caps today, that's ~600 tokens of overhead per call. At Phase 11 with 20+ caps, this becomes ~1500 tokens. Mitigations:
- **Filter the snapshot before sending:** drop capabilities whose `op` is incompatible with the goal. Coarse heuristic: if the goal mentions "extract", "remove background" → keep extract caps + composite + transform. Phase 9 can ship with the full snapshot (cheap enough at 8 caps); document as a Phase 10/11 optimization.
- **Drop the `invoke` function and large fields from the snapshot before serializing** — the existing `handleListCapabilities` already does this.
- **Cache the snapshot serialization for the duration of a request** — already implied by §10.2 mitigation.

### 10.5 Ref-resolution panic on data refs feeding image params

The validator (§4.3) prevents this at plan time, but if the runtime ever sees a data-typed ref where an image-typed path is expected (e.g., a future capability adds a data input field that wasn't in the table), the executor will pass an object where a string is expected and the capability will throw an obscure error. **Mitigation:** when `assertWithinInputRoot` is called on a non-string, throw a clear `NON_PATH_INPUT` error pointing at the field. Better: type-tag resolved values in `resolveRefs` and check the tag matches the receiving param shape.

### 10.6 `revisedPrompt` propagation is fragile

D-19 + TASK-10 require `revisedPrompt` in the trace when the cap returned one. The `CapabilityInvokeResult.kind === 'image'` arm has the field; `kind === 'data'` does not. **Action item:** in `runNodeWithRetry → buildSuccess`, conditionally copy `result.revisedPrompt` to `traceNode.revisedPrompt` only on the image branch. Add a unit test that mocks a cap returning a `revisedPrompt` and asserts it appears in the trace verbatim.

### 10.7 `IMAGE_GEN_INPUT_ROOT` cache invalidation in tests

The path-input-root utility caches the resolved root. Tests that mutate `process.env.IMAGE_GEN_INPUT_ROOT` between cases will see stale cache. Export `clearInputRootCache()` and call it in `beforeEach`. Document this in `tests/helpers/`.

### 10.8 Empty `bestPartial` is correct, not a bug

If a plan's first node fails and there are no successful image-producing predecessors of the terminal, `bestPartial` is undefined and the response has no `output`. The test for criterion 4 must explicitly cover this case as "best partial = nothing". The trace alone tells the story.

### 10.9 Planner cost is real cost

`total_cost_usd` in the response should include the planner cost (Haiku usage), not just the capability costs. Otherwise budgeting is misleading. Pull `usage.input_tokens` / `usage.output_tokens` off the `messages.parse` response, multiply by Haiku rates ($1 / $5 per 1M), and add to `manifest.planner.costUsd` AND to `total_cost_usd`. (For the budget cap gate at plan time, however, the gate is on **capability costs only** — TASK-05 explicitly says "estimated cost" matches the plan's sum-of-nodes, not including planner overhead. Be consistent and document this.)

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|-----------------|-----------|
| Goal-to-plan reasoning (LLM call) | API/Backend (Anthropic) | — | Owned by Anthropic SDK; this server is just a client |
| Plan validation (schema, refs, cycles, caps, budget) | Server (this MCP process) | — | Hard constraints can't trust the LLM; in-code is the only safe place |
| DAG execution | Server (this MCP process) | sharp/Replicate/tesseract subprocess for individual caps | Topology stays here; per-node work delegates to existing capability invocations |
| Artifact persistence | Local disk under `<outputDir>/.runs/<runId>/` | — | Phase 6 already owns this; reuse |
| Path/security validation | Server (this MCP process) | — | Threat surface is planner-emitted paths; must defend in-code |
| Response serialization | Server (this MCP process) — with explicit base64 guard | — | MCP stdio transport has size limits; D-20 invariant must be enforced here |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | `^0.92.0` | Haiku planner client + structured outputs | Official SDK; first-class `messages.parse` + `zodOutputFormat` removes hand-rolled JSON repair |
| `zod` | `^3.25.76` (already installed) | Plan schema, tool input schema | Already used throughout; pairs with Anthropic structured outputs |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@modelcontextprotocol/sdk` | `^1.0.0` | MCP tool registration | Mirror existing `image_op` pattern |
| `vitest` | `^2.1.9` | Test framework | Existing convention |
| Existing `src/runs/*` | — | Run IDs, dirs, atomic writes, trace, manifest | Reuse — already shaped for `image_task` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `messages.parse` + `zodOutputFormat` | Manual `messages.create` with prompt-engineered JSON + `JSON.parse` + Zod | More code, less reliable, brittle to model drift. Reject. |
| Anthropic tool_use with forced `tool_choice` | Same SDK, different helper | Workable but adds a tool-handling code path the planner doesn't otherwise need. Reject for simplicity. |
| Kahn's algorithm | DFS-based topological sort | DFS works but ready-queue from Kahn's naturally extends to bounded parallel execution in P10. Pick Kahn's. |
| Brand-new TraceNode for DAG | Reuse + extend existing TraceNode | Existing shape already covers 80% of fields. Adding 3 optionals beats forking. |

**Installation:**
```bash
npm install @anthropic-ai/sdk@^0.92.0
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM → typed JSON | Hand-rolled JSON repair / regex extraction / markdown-fence stripping | `messages.parse` + `zodOutputFormat` | Server-side schema enforcement + SDK Zod parse in one call |
| Structured LLM errors | `try { JSON.parse(text) } catch` | `Anthropic.APIError` subclass hierarchy | SDK already differentiates 401/429/400/5xx |
| Topological sort | DFS with visited set + cycle detection | Kahn's algorithm (~25 lines, see §3.3) | Simpler; ready queue extends to P10 parallelism naturally |
| Path-traversal defense | `path.resolve` + `startsWith` | `fs.realpath` + `startsWith` with separator boundary | Symlinks defeat the simple version; realpath defeats both `..` and symlinks |
| Atomic file writes | `fs.writeFile` | Existing `writeFileAtomic` (`src/runs/write.ts`) | Already battle-tested in Phase 6 |
| Run ID / dir / artifact paths | New conventions | `createRunId`, `resolveRunDir`, `nodeArtifactPath` | Already exist and Phase 6 retention sweep already understands them |

**Key insight:** Phase 9 should be ~70% glue-code over existing primitives. The novel parts are: planner client, plan schema, validator, executor, path-root utility, response serializer guard. Everything else (run dirs, atomic writes, manifests, trace nodes, capability invocation, structured cap errors, atomic image saves) already exists in the codebase.

## Common Pitfalls

(See §10 for full pitfall analysis. Summary list:)

1. LLM JSON parse failures — wrap, surface, persist raw, do not retry
2. Capability snapshot drift — pin snapshot at request entry, recheck live just-in-time before invoke
3. Multi-writer manifest races — defer to P10
4. Planner cost growth as caps grow — filter snapshot, drop noisy fields
5. Data-typed ref into image-typed param — type-tag resolved values
6. `revisedPrompt` only on image kind — conditional copy in trace builder
7. Cached `IMAGE_GEN_INPUT_ROOT` between tests — export `clearInputRootCache()`
8. Empty bestPartial is valid output — explicit test
9. Planner cost in `total_cost_usd` ≠ budget gate — gate on caps-only, report on caps + planner

## Code Examples

### Defensive planner call

```typescript
// Source: §2.2 + Pitfall §10.1
async function planTask(args: PlanArgs): Promise<Plan> {
  const startedAt = Date.now();
  try {
    const message = await anthropic.messages.parse({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      temperature: 0,
      system: buildSystemPrompt(args.snapshot, args.constraints),
      messages: [{ role: 'user', content: buildUserPrompt(args.goal, args.inputs, args.constraints) }],
      output_config: { format: zodOutputFormat(PlanSchema) },
    });
    if (!message.parsed_output) {
      throw new PlannerError('PLAN_PARSE_FAILED', 'Planner returned no parsed output');
    }
    return message.parsed_output;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new PlannerError('PLANNER_AUTH', err.message);
    if (err instanceof Anthropic.RateLimitError)      throw new PlannerError('PLANNER_RATE_LIMIT', err.message, true);
    if (err instanceof Anthropic.APIError)            throw new PlannerError('PLANNER_FAILURE', err.message, err.status >= 500);
    throw err;
  }
}
```

### Path-root validation

(See §7.1 — full code already inline.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Anthropic JSON via prompt engineering | `messages.parse` + `zodOutputFormat` | Late 2025 (GA) | Reliable schema enforcement, no ad-hoc parsers |
| Anthropic tool_use for structured output | Direct structured-outputs helper | Late 2025 | Less boilerplate |
| Claude Haiku 3 / 3.5 model IDs | `claude-haiku-4-5` (released 2025-10-15) | Oct 2025 | Use the new alias; better cost/perf |

**Deprecated/outdated:**
- `claude-3-haiku-20240307` model ID — superseded by `claude-haiku-4-5` for new builds
- Manual JSON parsing of Claude responses — superseded by structured outputs

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `output_config: { format: zodOutputFormat(PlanSchema) }` is supported by Haiku 4.5 | §2.2 | If unsupported on Haiku specifically, fall back to tool_use forced via `tool_choice`. The SDK helper docs confirm structured outputs is GA across the family but verify with one smoke call before locking in. [VERIFIED via Anthropic docs index, Haiku 4.5 explicitly listed for structured outputs by tessl.io, but recommend a single live smoke test in Wave 0.] |
| A2 | Anthropic SDK does not currently expose a `seed` parameter; recommend `temperature: 0` for determinism | §2.4 / §8.2 | If a `seed` is added before P9 ships, prefer it. Low risk — temperature=0 is the documented stability lever. |
| A3 | Best-partial BFS visit order from terminal is deterministic given the plan | §5.5 | Verified by construction (Map iteration in Node 18+ is insertion-ordered; `dependsOn` arrays are insertion-ordered). Falsifiable by criterion-4 test. |
| A4 | `fs.realpath` throws on missing files (we treat that as `InputPathOutsideRootError`) | §7.1 | Standard Node.js behavior since v0.x. If callers want a different policy on missing files, expose a flag. Low risk. |
| A5 | Total planning + validation + execution stays under MCP stdio response size limits when path-only | §6.5 | Yes — typical response is ~3-10 KB. The base64 guard catches accidental bloat. |
| A6 | `messages.parse` exposes `usage` like `messages.create` does | §10.9 | Highly likely (it's a thin wrapper) but verify the field path before locking the cost-attribution code. |

**Assumptions resolved (locked 2026-05-02 by user):**
- A1: `zodOutputFormat` works with Haiku 4.5 — verified via Wave 0 smoke test as part of 09-01 Task 1 acceptance (`@anthropic-ai/sdk@^0.92.0` install + import resolves).
- A6: `messages.parse` exposes `usage` field — accepted; if SDK shape differs at implementation time, executor reads token usage from whatever field the SDK exposes (cost telemetry is non-blocking for SC#1-#5).

## Open Questions (RESOLVED)

1. **Should `image_task` accept `outputPath`/`outputDir` like `image_op`?**
   - **RESOLVED: YES** — accept both. Reuse `resolveOutputPath`. Default behavior is `~/Downloads/generated-images/<auto-name>.png`. Document in the tool description. Locked into 09-03 Task 2 input schema.

2. **Should the planner be allowed to emit `outputPath`/`outputDir` for individual nodes?**
   - **RESOLVED: NO** — executor owns per-node artifact paths (`<runDir>/n<id>.png`). Plan validator rejects nodes with `params.outputPath`/`params.outputDir`. The terminal node gets the user-facing path, set by the executor, not the plan. Locked into 09-01 Task 5 plan-validator pass list.

3. **Where should `ANTHROPIC_API_KEY` absence surface — at server startup or at first `image_task` call?**
   - **RESOLVED: register tool unconditionally; fail with `PLANNER_AUTH` on first call.** Surface a one-line startup warning when `ANTHROPIC_API_KEY` is unset, mirroring existing provider-availability logs. Reason: Claude Code may cache the tool descriptor — conditional registration would surprise users. Locked into 09-01 Task 6 (planner error taxonomy) and 09-03 Task 3 (handler).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (runtime) | All | ✓ (assumed; project already runs) | `^22` (per `@types/node`) | — |
| `npm` | install | ✓ | — | — |
| `ANTHROPIC_API_KEY` | Planner LLM call | **Unknown — user-managed** | — | None at runtime; Phase 10 templates may bypass planner for some goals (out of P9 scope) |
| `@anthropic-ai/sdk` | Planner | **NOT YET INSTALLED** (per STATE.md "Pending Todos") | needs `^0.92.0` | None — install is required |
| `zod` | Schema | ✓ | `^3.25.76` | — |
| `vitest` | Tests | ✓ | `^2.1.9` | — |
| `IMAGE_GEN_INPUT_ROOT` | Optional path validation | Optional (env var, off by default) | — | When unset, `assertWithinInputRoot` is a no-op (D-26 wording: "optional") |

**Missing dependencies with no fallback:**
- `@anthropic-ai/sdk` package — Wave 0 must install it.

**Missing dependencies with fallback:**
- `ANTHROPIC_API_KEY` at runtime — fall back to a clear error on first `image_task` call (Open Question §3). Tests use a mock client to avoid real API usage.

## Security Domain

`security_enforcement` is treated as enabled (default).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (Anthropic API key) | Env var only; never log; never echo into trace |
| V3 Session Management | no | Stateless per-request; runId is non-secret |
| V4 Access Control | yes (path access) | `IMAGE_GEN_INPUT_ROOT` jail (D-26/D-27); applies symmetrically to `image_op` |
| V5 Input Validation | yes (load-bearing) | Zod for the plan envelope; `validateCapabilityParams` for per-cap params; `assertWithinInputRoot` for paths |
| V6 Cryptography | no | No new crypto in P9 |
| V12 Files & Resources | yes | PNG-only output; atomic writes; intermediate artifacts in jailed `<outputDir>/.runs/<runId>/` |

### Known Threat Patterns for the {LLM-planner + DAG-executor + filesystem} stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Planner emits a path with `..` traversal | Tampering | `assertWithinInputRoot` at plan-time + per-cap defense in depth |
| Planner emits a symlink-out path | Tampering | `fs.realpath` in `assertWithinInputRoot` (string-prefix check is insufficient) |
| Planner emits a cycle that loops execution forever | DoS | Kahn's algorithm cycle detection at plan-time → reject |
| Planner emits a 100-node DAG to exhaust Replicate budget | DoS | Plan node cap of 32 (Zod `.max(32)`) + budget cap (TASK-05) |
| Planner emits unregistered capability | Tampering | `CAPABILITY_NOT_REGISTERED` validation pass (§4.1 step 7) |
| Trace echoes input image content | Information Disclosure | Path-only invariant (D-20) + base64 guard (§6.5) |
| Anthropic API key logged | Information Disclosure | Use `process.env.ANTHROPIC_API_KEY` directly via SDK; never `console.log` env or capability snapshot keys |
| Concurrent runs race on the same `runId` | Tampering | `createRunId` uses 6 hex bytes of randomness; collision improbable; existing `resolveRunDir` validates ID format and creates dir idempotently |
| MCP response too large (base64 leak) | DoS / DX | `serializeImageTaskResponse` invariant (§6.5) + heuristic guard |
| Planner exfiltrates capability snapshot to Anthropic that includes secrets | Information Disclosure | The snapshot serializer (existing `handleListCapabilities`) excludes `invoke` and never had access to API keys; verify no secret leaks via a Wave 0 test |

## Sources

### Primary (HIGH confidence)
- Context7 `/anthropics/anthropic-sdk-typescript` — `messages.parse`, `zodOutputFormat`, `betaTool`, error class hierarchy, `toolRunner` (verified 2026-05-02)
- `npm view @anthropic-ai/sdk version` → `0.92.0`, modified 2026-04-30 (verified 2026-05-02)
- In-repo: `src/capabilities/types.ts`, `src/capabilities/registry.ts`, `src/capabilities/validation.ts`, `src/capabilities/*.ts` (all 8 caps), `src/runs/*.ts`, `src/index.ts:handleImageOp`, `src/utils/image.ts:resolveOutputPath` — all read in this research session
- `.planning/phases/09-image-task-planner-dag-executor/09-CONTEXT.md` — locked decisions D-01..D-27
- `.planning/phases/08-op-primitives-expansion/08-CONTEXT.md` — capability contract, `CapabilityInvokeError`, `idempotencyKey`, `list_capabilities`

### Secondary (MEDIUM confidence)
- [Claude API Pricing 2026 — BenchLM.ai](https://benchlm.ai/blog/posts/claude-api-pricing) — Haiku 4.5 model ID and pricing
- [pricepertoken.com Haiku 4.5 page](https://pricepertoken.com/pricing-page/model/anthropic-claude-haiku-4.5) — context window, release date
- [Anthropic Structured Outputs blog (tessl.io)](https://tessl.io/blog/anthropic-brings-structured-outputs-to-claude-developer-platform-making-api-responses-more-reliable/) — GA confirmation for Haiku 4.5
- [Wikipedia: Topological sorting](https://en.wikipedia.org/wiki/Topological_sorting) — Kahn's algorithm
- [USACO Guide: Topological Sort](https://usaco.guide/gold/toposort) — Kahn's algorithm reference

### Tertiary (LOW confidence — recommend smoke-validate)
- Reliability heuristic of "97-98% first-pass" for flat schemas <8 fields under tool_use (search summary, single source) — confirm with Wave 0 smoke test of the actual plan schema

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — SDK version verified live; helpers verified via Context7; existing zod/Vitest in repo
- Plan schema: **HIGH** — derived from existing capability validation patterns + Phase 8 contract
- Validation pipeline: **HIGH** — pure code design over verified inputs
- DAG executor: **HIGH** — Kahn's algorithm is textbook; retry-once and best-partial logic are isolated and unit-testable
- Trace/manifest extension: **HIGH** — additive to existing types; no breaking changes
- `IMAGE_GEN_INPUT_ROOT`: **HIGH** — Node `fs.realpath` semantics are stable; path-prefix-with-separator is established practice
- MCP tool registration: **HIGH** — mirrors existing `image_op` pattern verbatim
- Pitfalls: **MEDIUM** — known cases listed; novel edge cases will surface during Wave 0 testing
- Anthropic Haiku 4.5 model ID exact alias `claude-haiku-4-5`: **MEDIUM** — confirmed by multiple secondary sources; one live smoke test will lock it (cheap insurance)

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (30 days; Anthropic SDK is stable enough that monthly drift is unlikely; Haiku model alias may not refresh until late-2026 if a Haiku 5 ships)

---

## RESEARCH COMPLETE

**Phase:** 9 — image_task Planner + DAG Executor
**Confidence:** HIGH

### Key Findings
- Use `@anthropic-ai/sdk@^0.92.0` with model `claude-haiku-4-5`. Use `client.messages.parse({ output_config: { format: zodOutputFormat(PlanSchema) }})` — first-class structured outputs remove the need for hand-rolled JSON parsers and integrate with Zod natively.
- Plan schema is a single Zod tree with discriminated `outputKind` per node, explicit `terminalNodeId`, and `$inputs.X` / `$nodes.X.output` reference primitives. Cycle detection and topological sort via Kahn's algorithm — its ready-queue interface naturally extends to Phase 10 parallelism without contract changes.
- DAG executor is small (~150 lines): pending → ready → running → success/error/skipped state machine; one retry only when `CapabilityInvokeError.retryable === true`; transitive downstream skip on failure; deterministic best-partial via BFS over `dependsOn` from terminal.
- `IMAGE_GEN_INPUT_ROOT` defense uses `fs.realpath` (NOT `path.resolve` + `startsWith`) to defeat both `..` traversal AND symlinks-out. Apply at plan time AND at the top of each capability `invoke` for defense-in-depth. 8 capability files need a one-line addition.
- Reuse existing `TraceNode` (add 3 optional fields + `'skipped'` status). Reuse existing `RunManifest` (add `plan`, `planner`, `totals`, `bestPartial`). Compact MCP response is a thin slice; full audit lands in `<runDir>/manifest.json` per D-21.
- Validation Architecture (Nyquist) is fully mappable: 10 phase requirements → 11 test files (all Wave 0 gaps); 5 ROADMAP success criteria → falsifiable strategies using a mock Anthropic client + invoke-counter pattern + forced-failure pattern.

### File Created
`/Users/benlamm/Workspace/image-gen-mcp/.planning/phases/09-image-task-planner-dag-executor/09-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | SDK version live-verified (npm view); helpers verified via Context7 |
| Architecture | HIGH | Reuses existing `src/runs/*` and `CapabilityInvokeError`; novel parts (planner, executor, validator) are small and well-bounded |
| Pitfalls | MEDIUM | Listed cases are exhaustive for known surface; integration-test surprises possible during Wave 0 |

### Open Questions
1. Whether `image_task` should accept `outputPath`/`outputDir` (recommendation: yes, default to auto-naming).
2. Whether the planner can emit `outputPath`/`outputDir` per node (recommendation: NO; reject in validation).
3. Where to surface missing `ANTHROPIC_API_KEY` (recommendation: register the tool unconditionally; fail-with-clear-error on first call; warn at startup).

### Ready for Planning
Research complete. Planner can now create PLAN.md files. Recommended split: 3 plans (consistent with ROADMAP estimate).
- **09-01-PLAN:** dependency install (`@anthropic-ai/sdk`); plan schema; planner module; validator module; path-input-root utility; unit tests for all four.
- **09-02-PLAN:** DAG executor; ref resolver; best-partial selector; trace/manifest extensions; integration tests for execute / failure / dry_run.
- **09-03-PLAN:** `image_task` MCP tool registration in `src/index.ts`; response serializer with base64 guard; smoke integration test (criterion 1 end-to-end); README docs for `ANTHROPIC_API_KEY` and `IMAGE_GEN_INPUT_ROOT`.

Sources:
- [Anthropic SDK TypeScript helpers (Context7)](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md)
- [Claude API Pricing 2026 — BenchLM](https://benchlm.ai/blog/posts/claude-api-pricing)
- [Claude Haiku 4.5 specs — pricepertoken.com](https://pricepertoken.com/pricing-page/model/anthropic-claude-haiku-4.5)
- [Anthropic Structured Outputs GA — tessl.io](https://tessl.io/blog/anthropic-brings-structured-outputs-to-claude-developer-platform-making-api-responses-more-reliable/)
- [Anthropic Cookbook: Extracting Structured JSON via tool_use](https://github.com/anthropics/anthropic-cookbook/blob/main/tool_use/extracting_structured_json.ipynb)
- [Topological Sorting — Wikipedia](https://en.wikipedia.org/wiki/Topological_sorting)
- [Topological Sort — USACO Guide](https://usaco.guide/gold/toposort)
