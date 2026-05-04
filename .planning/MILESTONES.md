# Milestones: Image-Gen MCP

## v2.0 Goal-Shaped Image MCP (Shipped: 2026-05-04)

**Delivered:** A goal-shaped image MCP with direct capability invocation, measured provider routing, persistent run artifacts, planner-backed DAG execution, template fast paths, and live-evaluated provider breadth.

**Phases completed:** 1-11 (27 plans total, including v1.0 foundation and superseded Phase 4 closure)

**Key accomplishments:**
- Added `image_op` with a typed capability registry, first-class operation/provider routing, structured validation, and path-only traces.
- Added persistent run/session artifacts with unique run IDs, atomic intermediate writes, manifests, retention sweep, and trace contracts.
- Added deterministic eval infrastructure with golden fixtures, pixel/alpha/OCR scorers, score application into `quality.scores`, and unscored-provider guardrails.
- Expanded the primitive taxonomy to transform, composite, upscale, analyze dimensions, analyze palette, and analyze OCR.
- Added `image_task` goal handoff with Haiku planning, 12-pass plan validation, DAG execution, retry/skip semantics, best partials, and response guards against binary/base64 leakage.
- Added template fast paths and bounded executor parallelism, including `ASSET_PRESETS` by-reference templates and sub-cent budget gating.
- Added Photoroom, fal Flux Kontext, and Ideogram capability adapters with deterministic eval cases, live provider UAT, and trace-visible routing evidence.

**Stats:**
- 11 phases, 27 plans, 86 tasks
- 14,860 TypeScript lines across `src/`, `tests/`, and `scripts/`
- 304 automated tests passing
- Timeline: 2026-05-01 to 2026-05-04

**Git range:** `91dc190 docs(05): create phase plan` -> `0966501 chore: clear v2 milestone tech debt`

**Archives:**
- `.planning/milestones/v2.0-ROADMAP.md`
- `.planning/milestones/v2.0-REQUIREMENTS.md`
- `.planning/milestones/v2.0-MILESTONE-AUDIT.md`

**What's next:** Start the next milestone from a clean requirements slate with `$gsd-new-milestone`.

---
