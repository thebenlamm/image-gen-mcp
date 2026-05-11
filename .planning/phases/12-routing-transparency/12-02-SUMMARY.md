---
phase: 12-routing-transparency
plan: "02"
subsystem: capabilities
tags: [grok, replicate, image-generation, capability-adapter, constraint-enforcement]

requires:
  - phase: 12-routing-transparency
    provides: "Capability types, CapabilityInvokeError, ideogram-generate.ts reference pattern"

provides:
  - "createGrokGenerateCapability() — Grok v1 provider wrapped as (generate, grok) capability with runtime 1024-char prompt enforcement"
  - "createReplicateGenerateCapability() — Replicate v1 provider wrapped as (generate, replicate) capability"

affects:
  - "12-03 registration plan (will import and register both factories)"
  - "image_op routing (grok prompt constraint now enforced at invoke() — bypass-safe)"

tech-stack:
  added: []
  patterns:
    - "v1-provider delegation: capability adapter calls provider.generate() and translates errors to CapabilityInvokeError"
    - "Runtime constraint enforcement: Grok 1024-char limit checked inside invoke() so image_op callers cannot bypass it"
    - "No duplicate fetch: Replicate adapter omits URL fetch because v1 provider already handles it internally"

key-files:
  created:
    - src/capabilities/grok-generate.ts
    - src/capabilities/replicate-generate.ts
  modified: []

key-decisions:
  - "Enforced Grok 1024-char limit at runtime inside invoke() (not only in constraints metadata) because image_op bypasses planner constraint checks"
  - "Replicate adapter has zero fetch() calls — the v1 ReplicateProvider already fetches the result URL and returns Buffer directly"
  - "Both capabilities declare unscoredJustification with routing-parity rationale rather than eval scores — covers the transparency-gate use case"

patterns-established:
  - "Runtime constraint enforcement pattern: always enforce hard provider limits inside invoke(), not just in constraints object"

requirements-completed:
  - ROUTE-01
  - ROUTE-02

duration: 8min
completed: 2026-05-11
---

# Phase 12 Plan 02: Routing Transparency — Grok and Replicate Generate Adapters

**Grok and Replicate v1 text-to-image providers wrapped as (generate, provider) capability adapters, with Grok's 1024-char hard limit enforced at runtime inside invoke() to cover image_op bypass paths**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-11T00:00:00Z
- **Completed:** 2026-05-11T00:08:00Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments
- Created `grok-generate.ts` factory that delegates to v1 GrokProvider and enforces the 1024-char prompt limit at runtime (CONSTRAINT_VIOLATION thrown if exceeded — not just declared in constraints metadata)
- Created `replicate-generate.ts` factory that delegates to v1 ReplicateProvider with no duplicate URL fetch (v1 provider already fetches the result URL internally and returns Buffer)
- Both adapters include cost/latency metadata with `// approximate — based on provider pricing page 2026-05` comments and verbatim `unscoredJustification` per plan spec

## Task Commits

1. **Task 1: Grok generate capability adapter** - `d56d44e` (feat)
2. **Task 2: Replicate generate capability adapter** - `259de4f` (feat)

## Files Created/Modified
- `src/capabilities/grok-generate.ts` — Grok adapter with runtime 1024-char prompt enforcement
- `src/capabilities/replicate-generate.ts` — Replicate adapter delegating cleanly to v1 provider

## Decisions Made
- Enforced Grok's 1024-char limit at runtime inside `invoke()` (not only in `constraints.maxPromptLength`) because `image_op` callers bypass the planner's constraint check. This is the safety gap flagged in the CONTEXT.md.
- Replicate adapter has zero `fetch()` calls. The v1 `ReplicateProvider.generate()` already fetches the result URL from Replicate's SDK response and returns a `Buffer` — duplicating that fetch in the adapter would double-fetch on every call.
- Both capabilities use `quality.unscoredJustification` with the exact verbatim string from the plan (routing parity as transparency gate, not quality gate).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Factories return null if `XAI_API_KEY` (Grok) or `REPLICATE_API_TOKEN` (Replicate) are not set.

## Next Phase Readiness
- Both factories are ready to be imported and registered in `src/capabilities/register.ts` (Plan 12-03)
- Grok runtime enforcement means any `image_op` call with a prompt >1024 chars will get a clear CONSTRAINT_VIOLATION error

## Known Stubs
None.

## Threat Flags
None. Both files are adapters for existing v1 providers — no new network endpoints or auth paths introduced. The adapters use the same API keys and request paths as the v1 surface.

## Self-Check: PASSED
- `src/capabilities/grok-generate.ts` — confirmed exists, all grep checks pass
- `src/capabilities/replicate-generate.ts` — confirmed exists, all grep checks pass, zero `fetch(` calls
- `d56d44e` — confirmed in git log (grok adapter)
- `259de4f` — confirmed in git log (replicate adapter)
- `npm run build` exits 0 with no TypeScript errors

---
*Phase: 12-routing-transparency*
*Completed: 2026-05-11*
