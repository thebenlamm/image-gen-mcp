---
phase: 260424-heb-bump-grok-default
plan: 01
subsystem: providers/grok
tags: [quick-task, providers, grok, model-default, documentation]
requires: []
provides:
  - GrokProvider default model bumped to grok-imagine-image
  - scripts/check-models.ts KNOWN_DEFAULTS.grok mirror synced
  - README.md Grok model tables updated with real xAI API IDs
affects:
  - src/providers/grok.ts
  - scripts/check-models.ts
  - README.md
tech-stack:
  added: []
  patterns:
    - "Lockstep edit: provider default + KNOWN_DEFAULTS mirror + user-facing README in single commit"
key-files:
  created: []
  modified:
    - src/providers/grok.ts
    - scripts/check-models.ts
    - README.md
decisions:
  - "Use real xAI API IDs (grok-imagine-image, grok-imagine-image-pro) in README instead of prior shorthand 'grok-imagine'"
  - "Retain grok-2-image in README as callable override (not removed) for users with v2 billing"
metrics:
  duration: 2min
  completed: 2026-04-24
  tasks: 2
  files: 3
  commits: 1
---

# Quick Task 260424-heb: Bump Grok Default from grok-2-image to grok-imagine-image Summary

Prior task 260424-h6z's `npm run check-models` inventory surfaced that xAI's `/v1/image-generation-models` no longer lists `grok-2-image` as an available default; this task closes the loop by updating the provider default to `grok-imagine-image`, syncing the lockstep `KNOWN_DEFAULTS` mirror in `scripts/check-models.ts`, and updating both README model tables with the real API IDs.

## Execution

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Bump Grok default in provider + KNOWN_DEFAULTS mirror + README | Complete | `809e132` |
| 2 | Verify build passes after default bump | Complete (verification-only, no commit) | — |

## Exact Line-Level Changes

### 1. `src/providers/grok.ts` (line 5)

```diff
-  defaultModel = 'grok-2-image';
+  defaultModel = 'grok-imagine-image';
```

No other changes — `generate()` behavior, error messages, and char handling untouched.

### 2. `scripts/check-models.ts` (line 26, inside `KNOWN_DEFAULTS`)

```diff
   grok: 'grok-2-image',
+  grok: 'grok-imagine-image',
```

The `// Last synced: 2026-04-24` comment was left unchanged (today IS 2026-04-24, so the sync date is accurate).

### 3. `README.md` (two tables)

**Supported Providers table (line 23):**

```diff
-| **xAI Grok** | `grok-2-image` (default), `grok-imagine` | Aurora image generation |
+| **xAI Grok** | `grok-imagine-image` (default), `grok-imagine-image-pro`, `grok-2-image` | Aurora image generation |
```

**Provider-Specific Models table (line 232):**

```diff
-| Grok | `grok-2-image`, `grok-imagine` |
+| Grok | `grok-imagine-image`, `grok-imagine-image-pro`, `grok-2-image` |
```

Both tables: `grok-imagine-image` listed first as new default, `grok-imagine-image-pro` added as known variant, `grok-2-image` retained as callable override. The incorrect `grok-imagine` shorthand (without `-image` suffix) is fully removed.

## Build Verification

`npm run build` → exit code 0. No TypeScript errors, no warnings introduced.

`dist/providers/grok.js` rebuilt and contains the new default string `grok-imagine-image` (verified via grep).

Git diff stat (surgical):

```
 README.md               | 16 ++++++++--------
 scripts/check-models.ts |  2 +-
 src/providers/grok.ts   |  2 +-
 3 files changed, 10 insertions(+), 10 deletions(-)
```

## Lockstep Consistency Verified

- `grok-imagine-image` appears 1x in `src/providers/grok.ts`, 1x in `scripts/check-models.ts`, 4x in `README.md` (2 tables × 2 IDs each including `-pro` variant).
- No remaining references to bare `grok-imagine` (without `-image` suffix) anywhere in the three touched files.
- `grok-2-image` retained as an available model in README (2 occurrences — one per table).
- Provider default, `KNOWN_DEFAULTS` mirror, and user-facing README all agree on `grok-imagine-image`.

## Behavior Unchanged

`GrokProvider.generate()` is semantically identical: no new validation, no char-limit enforcement, no error-message changes, no new fetch options. Callers that explicitly pass `model: 'grok-2-image'` still route to that model on the xAI API — this task only changes the default when no `model` parameter is supplied.

## Deviations from Plan

None — plan executed exactly as written.

## Out-of-Scope Reminder

The `MEMORY.md` note for Grok (1024-char prompt limit, poor text rendering) was **NOT** validated against `grok-imagine-image`. The plan explicitly scoped this out. Those observations were captured against `grok-2-image`; `grok-imagine-image` may behave differently (improved text rendering and/or different prompt limits). A future quick task should re-validate those assumptions after Ben exercises the new default on a label/sticker generation and observes actual behavior — at which point `MEMORY.md` can be updated or the Grok notes can be deprecated entirely.

## Self-Check: PASSED

- FOUND: src/providers/grok.ts (modified, defaultModel = 'grok-imagine-image')
- FOUND: scripts/check-models.ts (modified, grok: 'grok-imagine-image')
- FOUND: README.md (modified, both tables)
- FOUND: commit 809e132 in git log
- FOUND: dist/providers/grok.js (rebuilt with new default)
