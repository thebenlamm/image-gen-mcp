---
phase: 12-routing-transparency
plan: 03
subsystem: api
tags: [capabilities, registry, generate, routing, ideogram, openai, gemini, grok, replicate, together]

# Dependency graph
requires:
  - phase: 12-routing-transparency
    plan: "01"
    provides: openai-generate, gemini-generate, together-generate, grok-generate, replicate-generate capability factories
  - phase: 12-routing-transparency
    plan: "02"
    provides: fal edit-prompt capability and patterns for unscored production registration

provides:
  - All 6 generate providers wired into registerBuiltInCapabilities() with allowUnscoredProduction
  - Ideogram registration fixed (quality.unscoredJustification added; allowUnscoredProduction flag added)
  - Smoke test locking cardinality contract for all 6 generate providers

affects:
  - list_capabilities output (6 generate rows now visible)
  - image_task planner capability snapshot
  - Future plans adding more generate providers (test acts as cardinality regression guard)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "All unscored generate providers registered with { allowUnscoredProduction: true } and quality.unscoredJustification"
    - "Smoke test pattern: env-stub all provider keys, call registerBuiltInCapabilities(), assert registry.get/list"

key-files:
  created:
    - tests/capabilities/register-smoke.test.ts
  modified:
    - src/capabilities/register.ts
    - src/capabilities/ideogram-generate.ts

key-decisions:
  - "Added quality.unscoredJustification to ideogram-generate.ts to satisfy D-09 audit trail contract (required for allowUnscoredProduction)"
  - "Ideogram fix and 5 new registrations committed together — shipping one without the other would cause a startup throw"
  - "Smoke test uses the capabilityRegistry singleton without explicit reset — re-registration with same modelVersion is idempotent and safe across tests"

patterns-established:
  - "register.ts pattern: every unscored generate cap uses { allowUnscoredProduction: true } and must have quality.unscoredJustification non-empty"

requirements-completed:
  - ROUTE-01
  - ROUTE-02
  - ROUTE-03

# Metrics
duration: 15min
completed: 2026-05-11
---

# Phase 12 Plan 03: Register All 6 Generate Capabilities + Smoke Test Summary

**All 6 generate providers (ideogram, openai, gemini, grok, replicate, together) wired into registerBuiltInCapabilities() with cardinality-safe registration; Ideogram startup-throw bug fixed; 4-assertion smoke test locks the contract.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-11T17:35:00Z
- **Completed:** 2026-05-11T17:50:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Imported and conditionally registered all 5 new generate capability factories from Plans 01 and 02
- Fixed pre-existing Ideogram bug: missing `{ allowUnscoredProduction: true }` would throw at startup with any second unscored generate provider present
- Added missing `quality.unscoredJustification` to `ideogram-generate.ts` (required by D-09 audit trail contract)
- Created 4-test smoke suite covering ROUTE-01, ROUTE-02, and ROUTE-03 requirements
- Full test suite: 308 tests pass (304 prior + 4 new)

## Task Commits

1. **Task 1: Wire 5 new generate capability adapters; fix Ideogram registration** - `d658849` (feat)
2. **Task 2: Add register smoke test** - `2c9c3c6` (test)

## Files Created/Modified
- `src/capabilities/register.ts` - Added 5 imports and 6 conditional registration blocks (including Ideogram fix)
- `src/capabilities/ideogram-generate.ts` - Added `quality.unscoredJustification` field (required by cardinality contract)
- `tests/capabilities/register-smoke.test.ts` - New 4-test smoke suite for all 6 generate providers

## Decisions Made
- **Ideogram fix bundled with new registrations:** Adding any single new unscored generate cap without fixing Ideogram would cause a startup throw. Both changes committed atomically in Task 1.
- **quality.unscoredJustification added to ideogram-generate.ts:** The D-09 audit trail contract in registry.ts requires this field to be non-empty when registering with `allowUnscoredProduction: true`. Ideogram was missing it — discovered at runtime, fixed in place.
- **No registry reset in smoke test:** `capabilityRegistry.register()` is idempotent for the same `(op, provider, modelVersion)` triple. Multiple calls to `registerBuiltInCapabilities()` across test cases are safe without explicit reset.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing quality.unscoredJustification to ideogram-generate.ts**
- **Found during:** Task 1 (runtime smoke verification after building)
- **Issue:** `ideogram-generate.ts` had no `quality` field at all. The registry throws `"requires a non-empty quality.unscoredJustification"` when registering with `allowUnscoredProduction: true` but a missing/empty justification.
- **Fix:** Added `quality: { unscoredJustification: 'v1 text-to-image provider in production...' }` matching the pattern used in Plans 01 and 02 capability files.
- **Files modified:** `src/capabilities/ideogram-generate.ts`
- **Verification:** Runtime node probe printed `ALL 6 GENERATE CAPS REGISTERED`; build exits 0; ideogram-generate.test.ts still passes
- **Committed in:** `d658849` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required for correctness — without this fix the runtime verification step and any production startup with multiple generate caps would throw. No scope creep.

## Issues Encountered
None beyond the auto-fixed Ideogram quality field.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 generate providers are now visible in `list_capabilities` (ROUTE-01 satisfied)
- Each generate row exposes cost/latencyMsP50/quality/constraints fields (ROUTE-02 satisfied)
- The image_task planner's capability snapshot includes all 6 generate providers as routing candidates (ROUTE-03 satisfied)
- Smoke test acts as regression guard: any future PR dropping `allowUnscoredProduction` or `quality.unscoredJustification` on a generate cap will fail CI before merging

---
*Phase: 12-routing-transparency*
*Completed: 2026-05-11*
