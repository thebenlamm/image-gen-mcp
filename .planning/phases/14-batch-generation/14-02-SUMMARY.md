---
phase: 14-batch-generation
plan: "02"
subsystem: documentation
tags: [docs, batch, generate_batch, claude-md, agents-md]
dependency_graph:
  requires: []
  provides: [generate_batch-docs]
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
  - Added generate_batch to both the 'It exposes:' list and the Tool Surface section in CLAUDE.md for completeness
metrics:
  duration: ~3min
  completed: 2026-05-11
---

# Phase 14 Plan 02: Document generate_batch Tool Summary

**One-liner:** Added generate_batch docs to CLAUDE.md (tool surface + usage example) and AGENTS.md (tool listing + failure isolation rule), satisfying BATCH-02.

## Status

complete — 2/2 tasks completed

## Changes

- **CLAUDE.md** — Added `generate_batch` to the "It exposes:" list as a v1 batch tool; added it to the "Tool Surface:" section with a per-item failure isolation description; added a usage example in "Using The MCP From Claude Code" showing the `items` array, top-level `provider`, and `outputDir` parameters.

- **AGENTS.md** — Updated tool count from "six" to "seven MCP tools"; added `generate_batch` bullet to the tool list describing one-approval batch semantics and run artifact; added a failure isolation bullet to "Important Runtime Rules" explaining the `status` field (`'success'`/`'partial'`/`'error'`) and per-item `items` array outcomes.

## Task Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Update CLAUDE.md — generate_batch tool surface and usage example | 7e28642 |
| 2 | Update AGENTS.md — tool listing and failure isolation rule | ee17370 |

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Added generate_batch to "It exposes:" and "Tool Surface:" sections in CLAUDE.md**
- **Found during:** Task 1
- **Issue:** The task action described inserting only the usage example, but the key context section specified adding generate_batch to the tool surface list and "It exposes:" section. Omitting these would leave the file inconsistent — CLAUDE.md's Tool Surface section documents all tools, and skipping generate_batch would make it invisible to Claude Code callers scanning the overview.
- **Fix:** Added generate_batch bullet to both the "It exposes:" list and the "Tool Surface:" section before inserting the usage example.
- **Files modified:** CLAUDE.md
- **Commit:** 7e28642

## Verification

```
grep "seven MCP tools" AGENTS.md       -> Image Gen MCP exposes seven MCP tools:
grep -c "generate_batch" AGENTS.md     -> 2
grep -c "generate_batch" CLAUDE.md     -> 3
grep "partial" AGENTS.md               -> status field partial documented
npm test                               -> 318 tests passed (49 test files)
```

## Self-Check: PASSED

- CLAUDE.md contains 3 occurrences of "generate_batch" (exposes list, tool surface, usage example)
- AGENTS.md contains 2 occurrences of "generate_batch" (tool list, runtime rules)
- "seven MCP tools" present in AGENTS.md
- Failure isolation / partial status documented in AGENTS.md Important Runtime Rules
- All 318 tests pass
- Commits 7e28642 and ee17370 verified in git log
