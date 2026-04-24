---
phase: 260424-heb-bump-grok-default
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/providers/grok.ts
  - scripts/check-models.ts
  - README.md
autonomous: true
requirements:
  - GROK-DEFAULT-BUMP-01
must_haves:
  truths:
    - "GrokProvider.defaultModel is 'grok-imagine-image' (not 'grok-2-image')"
    - "KNOWN_DEFAULTS.grok in scripts/check-models.ts equals 'grok-imagine-image' (mirrors provider)"
    - "README's Supported Providers table shows grok-imagine-image as the default for xAI Grok"
    - "README's Provider-Specific Models table lists grok-imagine-image (default), grok-imagine-image-pro, and grok-2-image"
    - "`npm run build` succeeds with zero TypeScript errors"
  artifacts:
    - path: "src/providers/grok.ts"
      provides: "GrokProvider with updated defaultModel"
      contains: "defaultModel = 'grok-imagine-image'"
    - path: "scripts/check-models.ts"
      provides: "KNOWN_DEFAULTS mirror map, in lockstep with provider"
      contains: "grok: 'grok-imagine-image'"
    - path: "README.md"
      provides: "Documented Grok models (overview + provider-specific tables)"
      contains: "grok-imagine-image"
  key_links:
    - from: "src/providers/grok.ts"
      to: "scripts/check-models.ts"
      via: "manually-mirrored KNOWN_DEFAULTS map"
      pattern: "grok: 'grok-imagine-image'"
    - from: "src/providers/grok.ts"
      to: "README.md"
      via: "documented default in both model tables"
      pattern: "grok-imagine-image \\(default\\)"
---

<objective>
Bump the Grok provider's default model from `grok-2-image` to `grok-imagine-image` after `npm run check-models` confirmed `grok-2-image` is no longer listed in xAI's `/v1/image-generation-models` response. Update the manually-mirrored `KNOWN_DEFAULTS` map in `scripts/check-models.ts` and both README model tables in lockstep.

Purpose: Prevent users from hitting a dead model ID when no `model` parameter is passed to the Grok provider. The prior quick task (260424-h6z) added the inventory check that surfaced this drift; this task closes the loop.

Output: Provider default bumped, lockstep mirror updated, README documentation updated, build passes. No behavior changes to generate() path.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@src/providers/grok.ts
@scripts/check-models.ts
@README.md

<interfaces>
<!-- Current state of the three files, extracted so the executor does not need to re-read. -->

From src/providers/grok.ts (line 5):
```typescript
defaultModel = 'grok-2-image';
```

From scripts/check-models.ts (lines 23-29):
```typescript
const KNOWN_DEFAULTS: Record<ProviderName, string> = {
  openai: 'gpt-image-2',
  gemini: 'gemini-2.5-flash-image',
  grok: 'grok-2-image',
  together: 'black-forest-labs/FLUX.1-schnell',
  replicate: 'black-forest-labs/flux-1.1-pro',
};
```

Also in scripts/check-models.ts (line 21):
```typescript
// Last synced: 2026-04-24
```
(The sync-date comment should be left at 2026-04-24 since today IS 2026-04-24.)

From README.md (line 23) — Supported Providers table row:
```
| **xAI Grok** | `grok-2-image` (default), `grok-imagine` | Aurora image generation |
```

From README.md (line 232) — Provider-Specific Models table row:
```
| Grok | `grok-2-image`, `grok-imagine` |
```
</interfaces>

<constraints>
- Do NOT remove `grok-2-image` from README's available-models lists — keep it as a callable override for users with v2 billing.
- Do NOT change behavior of GrokProvider.generate(): no new validation, no char-limit enforcement, no error-message changes.
- Do NOT touch the MEMORY.md Grok note (it may be stale re: grok-imagine-image but validating that is out of scope).
- Surgical edits only — every changed line must trace to this default bump.
- The two README tables both currently say "grok-imagine" (without the "-image" suffix). Replace with the real API ID "grok-imagine-image" and add "grok-imagine-image-pro" as a known variant.
</constraints>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Bump Grok default to grok-imagine-image in provider + KNOWN_DEFAULTS mirror + README</name>
  <files>src/providers/grok.ts, scripts/check-models.ts, README.md</files>
  <action>
Make three coordinated string-level edits:

1. **src/providers/grok.ts** (line 5):
   - Change `defaultModel = 'grok-2-image';` to `defaultModel = 'grok-imagine-image';`
   - No other changes to this file.

2. **scripts/check-models.ts** (line 26, inside the `KNOWN_DEFAULTS` object):
   - Change `grok: 'grok-2-image',` to `grok: 'grok-imagine-image',`
   - Leave the `// Last synced: 2026-04-24` comment unchanged (today IS 2026-04-24).
   - No other changes to this file.

3. **README.md** — two tables:
   - Line 23 (Supported Providers table), change:
     ```
     | **xAI Grok** | `grok-2-image` (default), `grok-imagine` | Aurora image generation |
     ```
     to:
     ```
     | **xAI Grok** | `grok-imagine-image` (default), `grok-imagine-image-pro`, `grok-2-image` | Aurora image generation |
     ```
   - Line 232 (Provider-Specific Models table), change:
     ```
     | Grok | `grok-2-image`, `grok-imagine` |
     ```
     to:
     ```
     | Grok | `grok-imagine-image`, `grok-imagine-image-pro`, `grok-2-image` |
     ```
   - Keep `grok-2-image` listed (still a callable override). Replace the bare `grok-imagine` (wrong ID) with the real API IDs `grok-imagine-image` and `grok-imagine-image-pro`.
   - No other changes to README.md.

Why these three changes in lockstep: `scripts/check-models.ts` explicitly documents (lines 11-14) that its `KNOWN_DEFAULTS` is a manually-kept mirror of provider defaults and must be updated in the same commit as provider bumps. The README is the user-visible source of truth for the default.

Why `grok-imagine-image` and not `grok-imagine`: the xAI `/v1/image-generation-models` endpoint returns model IDs `grok-imagine-image` and `grok-imagine-image-pro`. The user's earlier shorthand "grok-imagine" was approximate — the real API ID has the `-image` suffix.
  </action>
  <verify>
    <automated>grep -q "defaultModel = 'grok-imagine-image'" src/providers/grok.ts && grep -q "grok: 'grok-imagine-image'" scripts/check-models.ts && grep -q "grok-imagine-image\` (default)" README.md && grep -q "grok-imagine-image-pro" README.md && ! grep -q "grok-2-image\` (default)" README.md && grep -q "grok-2-image" README.md && echo OK</automated>
  </verify>
  <done>
  - `src/providers/grok.ts` line 5 reads `defaultModel = 'grok-imagine-image';`
  - `scripts/check-models.ts` KNOWN_DEFAULTS.grok reads `'grok-imagine-image'`
  - README.md Supported Providers table shows `grok-imagine-image` as default, lists `-pro` and `grok-2-image` as alternatives
  - README.md Provider-Specific Models table lists all three Grok model IDs with `grok-imagine-image` first
  - `grok-2-image` is NOT marked as default anywhere, but is still listed as available
  - `grok-imagine` (without `-image` suffix) no longer appears in README
  </done>
</task>

<task type="auto">
  <name>Task 2: Verify build passes after default bump</name>
  <files>(no file modifications — verification only)</files>
  <action>
Run `npm run build` to confirm the TypeScript compilation still succeeds after the default string change. This is a pure string-literal change so it should compile without issue — but per CLAUDE.md "build verification" rule, we confirm zero errors before declaring done rather than assuming.

If the build fails:
  - Do NOT downgrade any TS check, do NOT add `// @ts-ignore`, do NOT modify tsconfig.
  - Report the error. The only legitimate cause would be an unrelated pre-existing build issue (investigate, don't paper over).

Do NOT run `npm run check-models` here — that requires a live XAI_API_KEY and network call, and is not needed for correctness verification. The inventory script's `KNOWN_DEFAULTS` entry is verified by the grep in Task 1.
  </action>
  <verify>
    <automated>npm run build 2>&1 | tail -20</automated>
  </verify>
  <done>
  - `npm run build` exits with code 0
  - `dist/providers/grok.js` compiled with new default (if inspected: contains the string `grok-imagine-image`)
  - No TypeScript errors, no warnings introduced by this change
  </done>
</task>

</tasks>

<verification>
Overall checks for this quick task:

1. **Lockstep consistency** — provider defaultModel, KNOWN_DEFAULTS mirror, and both README tables all agree on `grok-imagine-image` as the Grok default:
   ```bash
   grep -c "grok-imagine-image" src/providers/grok.ts scripts/check-models.ts README.md
   # Expect: grok.ts=1, check-models.ts=1, README.md>=3 (default mention in 2 tables + -pro variant in 2 tables)
   ```

2. **No stray references to old shorthand** `grok-imagine` (without `-image` suffix):
   ```bash
   ! grep -E "grok-imagine([^-]|$)" README.md src/providers/grok.ts scripts/check-models.ts
   ```

3. **grok-2-image retained** as callable override (NOT removed):
   ```bash
   grep -c "grok-2-image" README.md
   # Expect: 2 (one per table)
   ```

4. **Build passes**: `npm run build` → exit 0.

5. **Surgical diff**: `git diff --stat` should show only 3 files modified with small line counts (grok.ts: 1 line, check-models.ts: 1 line, README.md: 2 lines).
</verification>

<success_criteria>
- [x] `src/providers/grok.ts` defaultModel bumped to `grok-imagine-image`
- [x] `scripts/check-models.ts` KNOWN_DEFAULTS.grok mirrors the new default
- [x] README.md Supported Providers table and Provider-Specific Models table both list `grok-imagine-image` as default with `grok-imagine-image-pro` and `grok-2-image` as alternatives
- [x] `grok-imagine` (wrong ID, without `-image` suffix) removed from README
- [x] `grok-2-image` retained in README as still-available override
- [x] `npm run build` succeeds
- [x] No behavior change to GrokProvider.generate()
- [x] No edits to files outside the three listed in `files_modified`
</success_criteria>

<output>
After completion, create `.planning/quick/260424-heb-bump-grok-default-from-grok-2-image-to-g/260424-heb-SUMMARY.md` documenting:
- The three exact line-level changes made
- Confirmation that `npm run build` passed
- Note that behavior of GrokProvider.generate() is unchanged
- Reminder that MEMORY.md's Grok note about "1024 char limit / poor text rendering" was NOT validated against grok-imagine-image (out of scope; candidate for a future quick task if the user exercises the new default and sees different behavior)
</output>
