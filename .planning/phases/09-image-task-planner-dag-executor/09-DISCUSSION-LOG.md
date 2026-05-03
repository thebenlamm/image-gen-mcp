# Phase 9: image_task Planner + DAG Executor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-03
**Phase:** 09-image-task-planner-dag-executor
**Areas discussed:** Plan contract and validation, Routing and budget behavior, Executor failure semantics, Trace and artifact contract

---

## Plan Contract and Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Strict explicit DAG | Stable node IDs, explicit refs, machine-checkable params, registry validation before execution. | ✓ |
| Looser planner output | Let Haiku emit a more natural plan and normalize it later after learning from usage. | |
| Agent discretion | Let implementation choose strictness during planning. | |

**User's choice:** Lock the disciplined middle path with a strict plan schema.
**Notes:** The final decision treats the plan schema as the durable execution contract. The planner may reason flexibly, but the emitted plan must be boring JSON that code can validate. Vague references like "previous result" are rejected in favor of explicit refs such as `$inputs.product` and `$nodes.extract.output`.

---

## Routing and Budget Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Code-enforced hard constraints, LLM soft routing | Code validates capability legality, params, budget, latency, and input/output constraints; Haiku chooses among legal routes. | ✓ |
| Code-driven router | Prefer deterministic quality/cost/latency sorting over LLM provider choice. | |
| Planner-driven router | Let Haiku use registry metadata and explain choices, with minimal soft-policy enforcement. | |

**User's choice:** Lock code-enforced hard constraints with Haiku choosing among legal routes.
**Notes:** Budget cap is a hard plan-time gate. Quality scores influence routing only when present. If quality is missing, route choice may use cost, latency, and provider fit, but trace must show that no measured quality was available.

---

## Executor Failure Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Small deterministic DAG executor | Topological execution, node try/catch, one retry for retryable errors, skip blocked downstream nodes, deterministic best partial result. | ✓ |
| Full workflow engine | More recovery machinery, richer partial-result ranking, broader concurrency and retry policies. | |
| Minimal sequential executor | Execute in order, stop on first failure, return last successful image artifact. | |

**User's choice:** Lock the small deterministic DAG executor.
**Notes:** Phase 9 should not build a full orchestration framework. Best partial result is mechanical: latest successful image-producing node nearest to terminal output. Data-only nodes do not count as final output. Broad parallelism is deferred to Phase 10, while the Phase 9 plan/executor shape must allow it later.

---

## Trace and Artifact Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Stable compact trace + richer manifest | MCP response has enough detail to explain/debug; full audit trail lives under `.runs/<runId>/manifest.json`. | ✓ |
| Exhaustive response trace | Return nearly all execution internals in the MCP response. | |
| Minimal trace | Only node status, artifact paths, cost, latency, and errors; keep most internals private. | |

**User's choice:** Lock stable compact trace plus richer on-disk manifest.
**Notes:** Trace is a public debugging API, but must remain path-only and compact. Plan and trace schemas should align: plan says what should happen, trace says what actually happened.

---

## the agent's Discretion

- Exact TypeScript module layout for planner, validator, executor, and tool registration.
- Exact Zod schemas and prompt wording, provided locked validation and trace contracts are upheld.
- Exact manifest internals beyond stable MCP response fields.

## Deferred Ideas

- Template fast-paths and planner skipping — Phase 10.
- Broad executor parallelism / per-backend concurrency budgets — Phase 10.
- New provider breadth — Phase 11.
