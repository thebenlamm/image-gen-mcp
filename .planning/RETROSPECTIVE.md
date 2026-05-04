# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.0 — Goal-Shaped Image MCP

**Shipped:** 2026-05-04
**Phases:** 11 | **Plans:** 27 | **Tasks:** 86

### What Was Built

- Capability-routed image operations through `image_op`.
- Persistent run artifacts with manifests, traces, atomic writes, and retention.
- Deterministic eval harness with measured capability quality scores.
- Expanded primitive taxonomy for transform, composite, upscale, and analysis.
- Planner-backed `image_task` with strict validation, DAG execution, templates, budget gates, and bounded parallelism.
- Provider breadth across Photoroom, fal Flux Kontext, and Ideogram with live eval/UAT evidence.

### What Worked

- Keeping `ImageProvider` stable while adding `CapabilityRegistry` avoided a broad provider rewrite.
- Eval-gating provider routing caught provider-contract drift before it could become planner behavior.
- Template fast paths made common workflows cheaper and more deterministic than planner-only routing.
- Nyquist validation and the milestone audit exposed documentation drift and review warnings before archive.

### What Was Inefficient

- Some quick-task and UAT metadata used older status/filename conventions, which made the closeout audit noisy until normalized.
- The Phase 11 provider work required multiple live eval reruns because external-provider billing/credit and scoring behavior were not all known upfront.
- The first milestone archive pass produced too many low-level accomplishments; final summary quality required manual condensation.

### Patterns Established

- Provider adapters should reject unsupported semantics explicitly instead of silently accepting shared capability shapes.
- Every early-return path that creates a run must write a terminal manifest.
- Eval case shape must be linted against adapter constraints before scores can populate routing quality.
- Completed milestone artifacts should be archived so active planning stays small.

### Key Lessons

1. Treat shared operation schemas as a contract minimum, not proof every provider supports every field.
2. Live-provider evals need explicit spend/credit readiness before the verification loop starts.
3. Audit tools are useful, but milestone close should normalize legacy metadata before asking humans to accept debt.
4. Keep review-fix artifacts next to the original review so the archive shows warnings were closed.

### Cost Observations

- Model mix: planner work used Haiku for runtime planning; implementation and verification used the active coding model.
- Sessions: one main v2 closeout session plus live-provider eval reruns.
- Notable: template routing and sub-cent budget gates directly reduce future planner/API spend for common goals.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v2.0 | multiple | 11 | Moved from primitive-only tooling to measured, capability-routed goal handoff. |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v2.0 | 304 | Focused unit/integration/eval coverage | Local sharp/tesseract primitives where external APIs were unnecessary |

### Top Lessons

1. Measured quality belongs in the routing substrate before adding provider breadth.
2. Planner flexibility needs strict schema, validation, budget, and response-size boundaries.
