---
phase: 13-mockup-workflow
verified: 2026-05-11T18:01:00Z
status: passed
score: 3/3 must-haves verified
overrides_applied: 0
---

# Phase 13: Mockup Workflow Verification Report

**Phase Goal:** Users can hand image_task a brand mockup goal and get a plan that separates scene generation (no text in the AI prompt) from SVG wordmark compositing (composite_layers), with the pattern documented in CLAUDE.md and AGENTS.md.
**Verified:** 2026-05-11T18:01:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Invoking image_task with a brand mockup goal produces a validated two-step plan: generate a clean scene image, then composite an SVG wordmark at caller-specified placement parameters | VERIFIED | `brandMockup` in `src/task/templates.ts` lines 166-223 builds a two-node DAG: `scene` (generate:openai) -> `composite` (composite_layers:sharp). `matchTemplate()` runs `PlanSchema.safeParse` before returning. Test `matches brand-mockup when generate:openai is registered` confirms the plan shape. All 9 brand-mockup tests pass (318/318 total). |
| 2 | The generate step's prompt contains no text or typography instructions (text fidelity handled by SVG layer, not AI model) | VERIFIED | `src/task/templates.ts` line 177: `const scenePrompt = \`${input.goal}, photorealistic product scene, clean surfaces, no text, no labels, no typography, no words, no lettering\`;`. Suffix is hardcoded after caller's goal string and cannot be removed. Test `scene node prompt contains all five negative typography terms` verifies all five terms are present. |
| 3 | CLAUDE.md and AGENTS.md include a concrete mockup example showing the goal string, input_images reference for the SVG, and expected plan structure | VERIFIED | `CLAUDE.md` lines 105-118: contains goal `"brand-mockup"`, `input_images` with `.svg` path, `dry_run: true` JSON example, and description of the two-stage pattern. `AGENTS.md` lines 27-42: `## Mockup Workflow` section explains the generate-then-composite pattern, SVG as `input_images[0]`, default placement (bottom-left, 30% scale, 40px padding), and `image_op` escape hatch for custom placement. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/task/templates.ts` | brandMockup function, TEMPLATE_BUILDERS registration, two-node DAG | VERIFIED | Lines 166-223 implement `brandMockup`. Lines 237-238 register both `'brand-mockup'` and `'brand_mockup'` keys. Two-node DAG: `scene` (generate:openai) and `composite` (composite_layers:sharp). |
| `tests/task/templates.test.ts` | brand-mockup test coverage | VERIFIED | `describe('brand-mockup template', ...)` block at lines 221-324 contains 9 test cases covering: template match, underscore form, negative typography terms, SVG layer reference, dependsOn, null-when-empty-inputs, null-when-no-generate-cap, landscape sizing, schema validity, listTemplateIds. |
| `CLAUDE.md` | Mockup example with SVG input_images and dry_run example | VERIFIED | Lines 105-118: concrete JSON example with `"goal": "brand-mockup"`, `input_images` containing `.svg` path, `"dry_run": true`, and explanatory text. |
| `AGENTS.md` | Mockup Workflow section added | VERIFIED | Lines 27-42: `## Mockup Workflow` section positioned between `## Important Runtime Rules` and `## Capability Operations` as specified. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `matchTemplate()` | `brandMockup` builder | `TEMPLATE_BUILDERS['brand-mockup']` registry lookup | WIRED | `TEMPLATE_BUILDERS` at line 237-238 registers both hyphen and underscore forms. `matchTemplate()` at line 246 looks up by normalized key. |
| `brandMockup` scene node | `generate:openai` capability | `registry.get(node.op, node.provider)` guard in `matchTemplate()` | WIRED | Lines 252-253: `matchTemplate` calls `registry.get` for every node before returning. Test `returns null when generate:openai is not registered` confirms the guard. |
| `brandMockup` composite node | SVG input ref | `firstInputRef(input)` -> `$inputs.image_0` | WIRED | Line 167: `const svgRef = firstInputRef(input)`. Line 204: `{ input: svgRef, ... }` in layer[1]. Test `composite node layers[1] references the SVG input ref` verifies `$inputs.image_0`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `brandMockup` template | `scenePrompt`, `svgRef`, `canvas` | `PlannerInput` (caller-supplied goal, inputImages, constraints) | Yes — derived from caller input at plan-construction time; plan executed by DAG executor at runtime | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All brand-mockup unit tests pass | `npm test 2>&1 | grep -E "brand-mockup|Tests"` | 9/9 brand-mockup tests pass; 318/318 total | PASS |
| Negative typography terms hardcoded in scene prompt | grep in templates.ts line 177 | All 5 terms present in template string literal | PASS |
| Both hyphen and underscore forms registered | grep lines 237-238 | `'brand-mockup': brandMockup, brand_mockup: brandMockup` | PASS |
| Commit hashes documented in SUMMARYs exist | `git log --oneline 8168092 45183d1 8d6eff4 dca7604` | All 4 commits confirmed | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| MOCK-01 | 13-01-PLAN.md | User can invoke image_task with a brand mockup goal and get a plan that generates a scene image (no text) then composites an SVG wordmark | SATISFIED | `brandMockup` builder + `matchTemplate` wiring + 9 passing tests |
| MOCK-02 | 13-02-PLAN.md | The two-stage generate -> composite pattern documented in CLAUDE.md and AGENTS.md with concrete example | SATISFIED | CLAUDE.md lines 105-118, AGENTS.md lines 27-42 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No stubs, placeholders, TODOs, or hardcoded empty returns found in the modified files.

### Human Verification Required

None. All success criteria are verifiable from the codebase:
- Template function exists and is substantive (not a stub)
- Negative typography terms are hardcoded in the prompt string literal
- Tests exercise all aspects of the two-node DAG shape
- Documentation is concrete (includes actual JSON example, not placeholder text)
- All 318 tests pass

## Gaps Summary

No gaps. Phase goal is fully achieved.

---

_Verified: 2026-05-11T18:01:00Z_
_Verifier: Claude (gsd-verifier)_
