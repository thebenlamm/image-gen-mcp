---
phase: 01-core-enhancements
plan: 02
subsystem: api
tags: [mcp, provider-selection, style-modifier, capability-flags]

# Dependency graph
requires:
  - phase: 01-core-enhancements/01
    provides: "Output path control, default grok provider, startup logs"
provides:
  - "supportsSize capability flag on ImageProvider interface"
  - "getSizeCapable() method on ProviderRegistry"
  - "style parameter for prompt modification at tool level"
  - "Size-aware provider auto-selection (skip non-size-capable providers)"
  - "Enhanced error responses with availableProviders array"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capability flags on provider interface for feature detection"
    - "Tool-level prompt modification (style prepend) keeping providers unaware"
    - "Size-aware provider selection as targeted capability filter"

key-files:
  created: []
  modified:
    - src/providers/index.ts
    - src/providers/grok.ts
    - src/providers/openai.ts
    - src/providers/gemini.ts
    - src/providers/replicate.ts
    - src/providers/together.ts
    - src/index.ts

key-decisions:
  - "Style applied at tool level via prompt prepend, not passed to providers"
  - "Size-aware selection is a targeted capability filter, not a general fallback chain"
  - "Grok is only provider with supportsSize = false"

patterns-established:
  - "Capability flags: boolean properties on ImageProvider for feature detection"
  - "Tool-level prompt modification: style prepended as 'style, prompt' before generate()"
  - "Targeted selection: capability check only activates when feature requested"

# Metrics
duration: 2min
completed: 2026-01-30
---

# Phase 01 Plan 02: Style Parameter and Size-Aware Provider Selection Summary

**supportsSize capability flag on providers, style prompt modifier, and automatic provider selection when size requested with non-capable provider**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-30T14:24:55Z
- **Completed:** 2026-01-30T14:26:31Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added `supportsSize` capability flag to `ImageProvider` interface with Grok as only provider that doesn't support size
- Style parameter prepended to generation prompt at tool level, keeping providers unaware of style semantics
- Size-aware provider selection: when user specifies landscape/portrait and default provider doesn't support it, system automatically selects first size-capable provider
- Enhanced error responses include `availableProviders` array for manual retry

## Task Commits

Each task was committed atomically:

1. **Task 1: Add supportsSize flag to provider interface, update all providers** - `20748d7` (feat)
2. **Task 2: Add style parameter and size-aware provider selection to MCP tool** - `2827e04` (feat)

## Files Created/Modified
- `src/providers/index.ts` - Added `supportsSize` to ImageProvider interface, `getSizeCapable()` to ProviderRegistry
- `src/providers/grok.ts` - Added `supportsSize = false`
- `src/providers/openai.ts` - Added `supportsSize = true`
- `src/providers/gemini.ts` - Added `supportsSize = true`
- `src/providers/replicate.ts` - Added `supportsSize = true`
- `src/providers/together.ts` - Added `supportsSize = true`
- `src/index.ts` - Style parameter, size-aware selection, enhanced error response, size-capable startup log

## Decisions Made
- **Style at tool level:** Style is prepended to the prompt as `"style, prompt"` before calling `generate()`. Providers never see a separate style field. This keeps the provider interface simple and style logic centralized.
- **Targeted capability filter:** Size-aware selection only activates when the user explicitly requests a size AND the selected provider doesn't support it. This is not a general fallback chain.
- **Original prompt for filenames:** `effectivePrompt` (with style) is used for generation, but the original `prompt` is used for filename generation via `resolveOutputPath()`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Provider interface now has capability flag pattern established for future capability checks
- Style and size features ready for use
- Phase 01 (Core Enhancements) complete -- both plans executed

---
*Phase: 01-core-enhancements*
*Completed: 2026-01-30*
