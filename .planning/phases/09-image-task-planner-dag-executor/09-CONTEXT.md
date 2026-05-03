# Phase 9: image_task Planner + DAG Executor - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the `image_task` MCP tool so users can hand off a natural-language image goal and receive a final image plus structured trace. This phase owns Haiku-planned JSON DAG creation, registry-backed plan validation, dry-run, hard budget enforcement, DAG execution, node-level failure handling, and path-only trace output.

Phase 9 does not implement template fast-paths, new providers, or broad executor parallelism. Phase 10 owns template fast-paths and heavier parallel execution; Phase 11 owns provider breadth.

</domain>

<decisions>
## Implementation Decisions

### Plan contract and validation
- **D-01:** Use a strict, explicit JSON DAG plan. Do not let the planner emit vague references such as "previous result."
- **D-02:** Each plan node must have a stable `id`, `op`, `provider`, `params`, `dependsOn`, and declared output/reference shape. Include estimated `costUsd`, estimated `latencyMs`, and optional planner `reason` when useful.
- **D-03:** Plan references must be explicit and machine-checkable, using forms like `$inputs.product` and `$nodes.extract.output`.
- **D-04:** The planner can propose a route, but code validates it. If an `(op, provider)` pair is not registered, the plan is invalid. If params fail capability validation, the plan is invalid. No best-effort execution of malformed plans.
- **D-05:** Design the plan schema as the durable execution contract. It should support Phase 10 concurrency without changing plan shape.

### Routing and budget behavior
- **D-06:** Hard constraints are enforced in code: registered capabilities, capability constraints, input/output compatibility, budget cap, latency cap, and param validation.
- **D-07:** Haiku chooses among legal routes using registry metadata from `list_capabilities`; code verifies the chosen route before execution.
- **D-08:** Quality scores influence routing only when present. If quality is missing, the planner may choose using cost, latency, and provider fit, but the trace must make clear that routing happened without measured quality.
- **D-09:** `constraints.budget_cap_usd` is a hard plan-time gate. If estimated cost exceeds the cap, fail before any provider call.
- **D-10:** Prefer a simple routing policy for Phase 9: hard constraints first, then measured quality when available, then lower cost, lower latency, and deterministic/local providers when otherwise equivalent.

### DAG executor and failure semantics
- **D-11:** Implement a small DAG executor, not a general workflow engine.
- **D-12:** Execute the validated DAG topologically. Phase 9 may keep execution mostly sequential, but the executor must not block Phase 10 from adding broader bounded parallelism.
- **D-13:** Wrap every node in node-level try/catch. Retry once only for `CapabilityInvokeError` values with `retryable: true`. Do not retry validation errors, unsupported ops, or non-retryable provider failures.
- **D-14:** If a node fails, downstream nodes whose dependencies cannot be satisfied are skipped, not attempted.
- **D-15:** Best partial result is defined mechanically: the latest successful image-producing node nearest to the intended terminal output. Data-only nodes never count as final output, but their data remains in trace.
- **D-16:** Structured `CapabilityInvokeError` fields (`code`, `retryable`, `suggestion`) should flow into trace so failures are actionable.

### Trace and artifact contract
- **D-17:** Treat trace as a stable debugging API, but keep the MCP response compact and path-only.
- **D-18:** The MCP response should include `runId`, `output` when available, `total_cost_usd`, `total_latency_ms`, a validated plan summary, and per-node trace details.
- **D-19:** Per-node trace details should include status, op, provider, model, input refs/artifact refs, output artifact path or data result, cost, latency, `revisedPrompt` when present, and structured error details when failed.
- **D-20:** Never return base64 image data in `image_task` responses or trace. Return filesystem paths only for image artifacts.
- **D-21:** Write the richer audit trail under `.runs/<runId>/manifest.json`; the MCP response should be enough for Claude Code to explain what happened without dumping every internal detail.
- **D-22:** Keep plan and trace schemas aligned: the plan says what should happen; the trace says what actually happened.

### Scope boundaries
- **D-23:** Do not implement template fast-paths in Phase 9. Phase 10 owns `ASSET_PRESETS`-backed planner skipping and new template signatures.
- **D-24:** Do not implement broad executor parallelism in Phase 9. Phase 9 should preserve a DAG-ready shape and only add minimal concurrency if it is trivial and does not expand scope.
- **D-25:** Do not add new providers in Phase 9. Route only across capabilities already registered by prior phases.

### Security and input path validation
- **D-26:** Fold the Phase 8 deferred backlog item into Phase 9 planning: add optional `IMAGE_GEN_INPUT_ROOT` path validation for all capability input fields because planner-generated paths widen the threat surface.
- **D-27:** When `IMAGE_GEN_INPUT_ROOT` is set, all input paths must resolve under that root and must reject `..` traversal plus symlinks pointing outside.

### the agent's Discretion
- Exact TypeScript module layout for planner, validator, executor, and `image_task` tool registration.
- Exact Zod schemas, provided they enforce the locked plan and trace contracts above.
- Exact prompt wording for Haiku, provided it emits only validated JSON and uses registry metadata rather than invented capabilities.
- Exact representation of terminal/final node, provided best partial result selection is deterministic and testable.
- Exact manifest internals beyond the stable MCP response fields.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 9: image_task Planner + DAG Executor" — phase goal, dependencies, success criteria, and the deferred `IMAGE_GEN_INPUT_ROOT` backlog item.
- `.planning/REQUIREMENTS.md` §"image_task Planner + DAG Executor (TASK)" — TASK-01..TASK-10, including dry-run, budget gate, DAG execution, failure trace, and path-only response requirements.
- `.planning/PROJECT.md` §"Key Decisions" — v2.0 architectural locks: Haiku planner, path-only trace, measured-quality routing, `generate_asset` not deprecated, template fast-paths deferred.
- `.planning/STATE.md` §"Decisions" and "Pending Todos" — active locks and Phase 9 pending dependency/env-var notes.

### Prior phase context
- `.planning/phases/08-op-primitives-expansion/08-CONTEXT.md` — capability result union, structured errors, data-returning ops, `list_capabilities`, per-backend concurrency note, and the Phase 9-proof capability contract.
- `.planning/phases/01-core-enhancements/01-CONTEXT.md` — path priority, PNG-only output, no silent provider fallback, clear error-response philosophy.

### Capability layer
- `src/capabilities/types.ts` — `CapabilityOp`, `Capability`, `CapabilityInvokeParams`, discriminated `CapabilityInvokeResult`, `CapabilityInvokeError`, cost/quality metadata, and `idempotencyKey`.
- `src/capabilities/registry.ts` — registry lookup/list/scoring behavior and unscored-production gate.
- `src/capabilities/register.ts` — built-in capability registration source for planner-readable operations.
- `src/capabilities/validation.ts` — pre-invocation capability constraint validation pattern.
- `src/capabilities/*.ts` — concrete capability params and error behavior for registered ops.

### Existing tool and run/session layer
- `src/index.ts` — MCP tool registration, existing `image_op` implementation, `list_capabilities`, response formatting, and server startup.
- `src/runs/id.ts` — run ID generation.
- `src/runs/dir.ts` — `.runs/<runId>/` directory resolution and run ID validation.
- `src/runs/write.ts` — atomic run artifact writes.
- `src/runs/manifest.ts` — manifest schema already accepts `tool: 'image_op' | 'image_task'`.
- `src/runs/trace.ts` — existing trace node shape to extend or align for DAG nodes.
- `src/runs/retention.ts` — startup retention sweep for run artifacts.

### v1.0 surfaces to preserve
- `src/utils/image.ts` — output directory and output path rules, `saveImage`, `resolveOutputPath`.
- `src/utils/processing.ts` — existing transform operations and image info helpers.
- `src/utils/presets.ts` — `ASSET_PRESETS`; Phase 9 should not fork or implement template fast-paths, but Phase 10 will import this by reference.

### External implementation docs
- Anthropic SDK / Claude Haiku docs — required for planner client, JSON prompting, timeout/error handling, and `ANTHROPIC_API_KEY` behavior.
- MCP SDK server tool docs — for adding `image_task` consistently with existing tool registration.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/index.ts:image_op`** — direct reference for run creation, manifest writes, capability lookup, validation, invocation, saving image results, data-result responses, and structured error formatting.
- **`src/index.ts:list_capabilities`** — planner input surface; use it or its serializer to expose ops, providers, constraints, cost, latency, and quality.
- **`src/capabilities/types.ts`** — already has `idempotencyKey?: string`, structured `CapabilityInvokeError`, image/data result union, and cost/quality metadata needed by the planner/executor.
- **`src/runs/*`** — run IDs, run directories, atomic artifact writes, manifests, and trace nodes already exist; `RunManifest.tool` already includes `image_task`.
- **`src/utils/image.ts`** — keep output path behavior consistent with v1.0 and `image_op`.

### Established Patterns
- **Provider/capability self-registration with graceful nulls** — planner must route only over currently registered capabilities.
- **Path-only responses** — existing v2.0 direction avoids MCP stdio response bloat; `image_task` extends this.
- **Atomic writes** — intermediate and final image artifacts should use the existing tmp+rename pattern.
- **Structured capability failures** — `CapabilityInvokeError` is already the actionability contract for retry/fail/skip semantics.
- **No silent fallback** — Phase 1 rejected opaque provider fallback; `image_task` may plan alternatives, but execution should not silently switch providers after validation without trace-visible reasoning.
- **Vitest 2.x** — existing test framework for planner/executor unit coverage.

### Integration Points
- **`src/index.ts`** — add `image_task` tool registration and handler.
- **New planner module** — likely owns Haiku client setup, prompt construction, capability snapshot, JSON parsing, and plan validation handoff.
- **New plan validator module** — validates schema, node references, capability existence, params, costs, latency, and input path policy.
- **New DAG executor module** — resolves node refs, invokes capabilities, writes artifacts, records trace, retries retryable failures once, skips impossible downstream nodes.
- **`src/runs/manifest.ts` / `src/runs/trace.ts`** — extend or reuse for plan/trace symmetry and `image_task` manifests.
- **Documentation / env var surface** — document `ANTHROPIC_API_KEY` and optional `IMAGE_GEN_INPUT_ROOT`.

</code_context>

<specifics>
## Specific Ideas

- The final locked direction is the disciplined middle path: strict plan schema, registry-backed validation, hard budget enforcement, a simple DAG executor, compact useful trace, richer manifest on disk, no template fast-paths, and no serious parallelism yet.
- The strongest rejected alternative was a thinner, looser Phase 9 that would learn from usage before locking schemas. We rejected it for the plan contract because Phase 9 is the load-bearing interface between planner, executor, trace, evals, and future templates.
- The strongest accepted counterpoint was to avoid building a general workflow engine. Failure handling and execution should be deterministic and small, not a broad orchestration framework.
- Plan/trace symmetry is intentional: easier dry-run, debugging, evals, and later template fast-paths.

</specifics>

<deferred>
## Deferred Ideas

- Template fast-paths and planner skipping — Phase 10.
- Broad bounded executor parallelism and per-backend concurrency budgets — Phase 10.
- New providers and expanded capability breadth — Phase 11.
- Richer cross-run cost dashboards — out of scope for v2.0; per-run cost remains in trace.

</deferred>

---

*Phase: 09-image-task-planner-dag-executor*
*Context gathered: 2026-05-03*
