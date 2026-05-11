---
phase: 13-mockup-workflow
plan: "02"
subsystem: docs
tags: [documentation, brand-mockup, image_task, workflow]
dependency_graph:
  requires: []
  provides: [brand-mockup-usage-docs]
  affects: [CLAUDE.md, AGENTS.md]
tech_stack:
  added: []
  patterns: [brand-mockup two-stage workflow documentation]
key_files:
  created: []
  modified:
    - CLAUDE.md
    - AGENTS.md
decisions:
  - CLAUDE.md usage example kept as inline example block (no heading) matching surrounding style
  - AGENTS.md Mockup Workflow section placed between Important Runtime Rules and Capability Operations per plan spec
metrics:
  duration: 90s
  completed: "2026-05-11T21:57:52Z"
---

# Phase 13 Plan 02: Brand Mockup Documentation Summary

**Status**: complete
**Tasks completed**: 2/2
**One-liner**: Brand-mockup two-stage workflow (AI scene + SVG composite) documented in CLAUDE.md and AGENTS.md with concrete JSON examples and negative typography explanation.

## Changes

- **CLAUDE.md** — Added a fourth example block in the "Using The MCP From Claude Code" section showing the `brand-mockup` goal string, SVG wordmark in `input_images`, `dry_run: true` usage, and a brief explanation of the two-stage pattern (negative typography prompt + `composite_layers:sharp` overlay at 30% scale).

- **AGENTS.md** — Added a `## Mockup Workflow` section after `## Important Runtime Rules` (before `## Capability Operations`) explaining the generate-then-composite pattern, why AI text rendering is avoided, the SVG as `input_images[0]` convention, default placement (bottom-left, 30% scale, 40px padding), and how to use `image_op` with `composite_layers:sharp` for custom placement.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1    | 8d6eff4 | docs(13-02): add brand-mockup image_task example to CLAUDE.md |
| 2    | dca7604 | docs(13-02): add Mockup Workflow section to AGENTS.md |

## Verification

- `grep -c "brand-mockup" CLAUDE.md` returns 2
- `grep -c "Mockup Workflow" AGENTS.md` returns 1
- `## Mockup Workflow` positioned at line 27 of AGENTS.md, between `## Important Runtime Rules` (line 18) and `## Capability Operations` (line 44)
- Both files reference `input_images[0]` with `.svg` path and `dry_run: true`
- All 304 tests pass (`npm test`)

## Notes

- CLAUDE.md and AGENTS.md do not duplicate content: CLAUDE.md has the usage example, AGENTS.md has the conceptual explanation plus example
- The "no text / no labels / no lettering" negative typography instructions are documented in both files
- AGENTS.md clarifies that `composite_layers:sharp` requires no API key (runs locally), while the generate step requires `OPENAI_API_KEY`

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- CLAUDE.md exists and contains "brand-mockup": confirmed
- AGENTS.md exists and contains "Mockup Workflow": confirmed
- Commit 8d6eff4 exists: confirmed
- Commit dca7604 exists: confirmed
