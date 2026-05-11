---
phase: 15-style-anchoring
plan: "02"
subsystem: documentation
tags: [docs, reference_image, style-anchoring, routing-transparency]
dependency_graph:
  requires: [15-01]
  provides: [STYLE-01, STYLE-02, STYLE-03 docs coverage]
  affects: [CLAUDE.md, AGENTS.md]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - CLAUDE.md
    - AGENTS.md
decisions:
  - "Inserted reference_image docs inline into existing Tool Surface bullets to minimize diff scope (surgical change rule)"
  - "Added Style Anchoring as a dedicated section in AGENTS.md for discoverability rather than burying in runtime rules"
metrics:
  duration: "~5 minutes"
  completed: "2026-05-11"
  tasks_completed: 2
  files_modified: 2
---

# Phase 15 Plan 02: Style Anchoring Documentation Summary

**One-liner:** CLAUDE.md and AGENTS.md updated with reference_image parameter docs, edit_prompt:openai routing behavior, and concrete usage examples.

**Status**: complete
**Tasks completed**: 2/2

## Changes

- **CLAUDE.md** — Updated `generate_image` Tool Surface bullet to describe `reference_image` and `edit_prompt:openai` routing; updated `generate_batch` bullet similarly; added JSON usage example block with documented response fields (`routedVia`, `referenceImage`, `model`), API key requirement, and note that `provider`/`model` params are ignored when set.
- **AGENTS.md** — Updated `generate_image` and `generate_batch` bullets in "What This MCP Provides"; added two runtime rule bullets covering OPENAI_API_KEY dependency and STYLE-03 routing transparency (`routedVia`); added a new "Style Anchoring" section with JSON request/response examples confirming the edit_prompt path.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — documentation-only changes; no new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- CLAUDE.md contains 5 occurrences of `reference_image` (>= 4 required)
- AGENTS.md contains 6 occurrences of `reference_image` (>= 6 required)
- AGENTS.md "Style Anchoring" section present at line 48
- AGENTS.md `routedVia` appears in runtime rules and Style Anchoring section
- All 328 tests pass (npm test)
- Commits: db1effb (CLAUDE.md), 7640010 (AGENTS.md)
