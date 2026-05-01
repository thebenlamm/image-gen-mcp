---
status: partial
phase: 05-capability-layer-image-op-first-2-caps
source: [05-VERIFICATION.md]
started: 2026-05-01T21:08:00Z
updated: 2026-05-01T21:58:00Z
---

## Current Test

Claude Code MCP UAT found two real bugs. Fixes have been applied and direct runtime smoke checks now pass. Awaiting Claude Code MCP re-test.

## Tests

### 1. image_op extract_subject from Claude Code
expected: "Returns success true with output, runId, trace.nodes[0].output, and the saved PNG is a clean alpha cutout"
result: [pending re-test]

Initial result: failed because provider `@imgly/local` was interpolated into generated filenames with `/` intact, causing the atomic `.tmp` write to target a non-existent nested directory.
Fix evidence: `generateFilename()` now sanitizes provider names; direct runtime smoke saved an `@imgly/local` output to `/private/tmp/image-gen-uat-output/2026-05-01-imgly-local-extract-subject-imgly-local-f1b10f.png`.

### 2. image_op edit_prompt from Claude Code with OPENAI_API_KEY configured
expected: "Returns success true with output, runId, trace.nodes[0].output, and the saved image reflects the requested GPT Image prompt edit"
result: [pending re-test]

Initial result: failed because the SDK multipart `images.edit()` path rejected GPT Image models for this project. A `dall-e-2` fallback was also rejected by the live API for this project.
Fix evidence: `edit_prompt` now uses the JSON Images API edit shape with data URL image references and default `gpt-image-1.5`; direct live smoke returned image bytes successfully.

## Summary

total: 2
passed: 0
issues: 2
pending: 2
skipped: 0
blocked: 0

## Gaps

### 1. Provider names must be filename-safe
status: fixed-pending-retest
source: image_op extract_subject UAT
fix: provider names are sanitized before generated filename interpolation

### 2. OpenAI edit_prompt must use a GPT Image-compatible JSON edit path
status: fixed-pending-retest
source: image_op edit_prompt UAT
fix: edit_prompt uses JSON `/v1/images/edits` with image data URL references and default `gpt-image-1.5`
