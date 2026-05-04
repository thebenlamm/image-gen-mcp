---
phase: 05-capability-layer-image-op-first-2-caps
reviewed: 2026-05-01T21:59:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - package.json
  - src/capabilities/edit-prompt.ts
  - src/capabilities/extract-subject.ts
  - src/capabilities/index.ts
  - src/capabilities/register.ts
  - src/capabilities/registry.ts
  - src/capabilities/types.ts
  - src/capabilities/validation.ts
  - src/index.ts
  - src/utils/image.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 05: Code Review Report

**Reviewed:** 2026-05-01T21:59:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** clean

## Summary

Re-reviewed the scoped capability-layer changes after the `extract_subject` runtime fix and the Claude Code MCP UAT failures. The implementation passes the input file path directly to `@imgly/background-removal-node`, sanitizes provider names before generated filename interpolation, and routes OpenAI `edit_prompt` through the JSON Images API edit shape with data URL image references.

All reviewed files meet quality standards. No issues found.

## Runtime Smoke Status

`npm run build` completed successfully.

Direct runtime smoke of `createExtractSubjectCapability().invoke()` against a generated PNG completed successfully:

```json
{"ok":true,"bytes":167,"model":"@imgly/background-removal-node@1","output":"/private/tmp/image-gen-uat-output/2026-05-01-imgly-local-extract-subject-imgly-local-f1b10f.png"}
```

Direct live smoke of `createEditPromptCapability().invoke()` with `OPENAI_API_KEY` configured completed successfully:

```json
{"ok":true,"bytes":86337,"model":"gpt-image-1.5","metadata":{"input":"/private/tmp/uat-openai-edit-input.png","size":"square"}}
```

No debug/security anti-patterns were found by the scoped pattern scan.

---

_Reviewed: 2026-05-01T21:59:00Z_
_Reviewer: Codex inline post-UAT review_
_Depth: standard_
