# Phase 11: Provider Breadth (Post-Eval) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-03
**Phase:** 11-provider-breadth-post-eval
**Areas discussed:** Routing gates, Provider shape, Eval cases, Route preferences

---

## Routing Gates

| Option | Description | Selected |
|--------|-------------|----------|
| Strict eval-gated planner routing | New providers may be registered/called directly, but `image_task` only prefers them after relevant scores exist. | ✓ |
| Exploratory planner routing | Allow `image_task` to route to registered providers before evals, with trace notes that quality is unmeasured. | |
| Fully blocked until evals | Do not expose new providers at all until evals and scores are complete. | |

**User's choice:** Lock the two-tier approach: direct `image_op` exploration is allowed after registration; planner preference requires eval evidence.
**Notes:** The opposing view was steelmanned: being too strict can make Phase 11 more about eval design than provider integration. Final decision keeps exploration available without weakening measured routing.

---

## Provider Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Capability-first | Add Photoroom, fal.ai, Flux Kontext, and Ideogram through `CapabilityRegistry`; avoid v1 provider churn. | ✓ |
| Capability plus v1 where applicable | Add Ideogram/fal to both `image_task` capabilities and v1 `generate_image` if they can generate. | |
| Broad provider abstraction | Generalize provider handling around platforms like fal.ai and expose many model routes. | |

**User's choice:** Capability-first. Ideogram should be a `generate` capability in Phase 11, not a v1 `generate_image` provider.
**Notes:** The opposing view was that user ergonomics favor making every generator available through `generate_image`. Final decision defers that until capability usage proves broad value.

---

## Eval Cases

| Option | Description | Selected |
|--------|-------------|----------|
| Small deterministic eval gates | Use focused programmatic cases that answer specific routing questions. | ✓ |
| Broader subjective evals | Include human/preference scoring for visual quality, product polish, and naturalness. | |
| Minimal smoke tests | Only verify adapters call APIs successfully and leave routing mostly planner-driven. | |

**User's choice:** Small deterministic eval gates, with comparable artifacts saved for human inspection.
**Notes:** The strongest counterargument was that image quality is often perceptual and deterministic metrics may miss what matters. Final decision avoids building a full subjective eval workflow in Phase 11.

---

## Route Preferences

| Option | Description | Selected |
|--------|-------------|----------|
| Goal-specific score routing | `quality_tier` biases routing, but the goal determines which measured score matters. | ✓ |
| Rigid tier policy | `best`, `fast`, and `balanced` map to fixed global quality/cost/latency rules. | |
| Planner-flexible routing | Give Haiku rich metadata and let it reason case-by-case with fewer coded preferences. | |

**User's choice:** Goal-specific score routing with clear tier bias.
**Notes:** Final decision: `best` means highest relevant quality within hard caps; `fast` means acceptable quality floor then latency; `balanced` means relevant measured quality first, then cost and latency. Text-heavy, product, and edit goals use different score families.

---

## the agent's Discretion

- Exact adapter/module layout.
- Exact eval score field names, provided they map clearly to routing questions.
- Exact provider environment variable names.
- Whether Flux Kontext is reached through fal.ai or BFL direct, based on implementation docs and current endpoint fit.

## Deferred Ideas

- Add Ideogram to v1 `generate_image` later if usage warrants it.
- Build subjective or pairwise human preference eval workflow after Phase 11 if deterministic gates prove too narrow.
- Generalize fal.ai into a broader provider platform abstraction later.
