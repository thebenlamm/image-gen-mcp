---
status: partial
phase: 05-capability-layer-image-op-first-2-caps
source: [05-VERIFICATION.md]
started: 2026-05-01T21:08:00Z
updated: 2026-05-01T22:22:00Z
---

## Current Test

Re-test from Claude Code MCP completed. extract_subject now passes end-to-end. edit_prompt surfaced a runtime bug: `.mcp.json` interpolated `${OPENAI_EDIT_MODEL}` literally when the parent shell var was unset, so the child process received the un-substituted string. A fix has been applied to both the MCP config default and source env parsing. Awaiting Claude Code MCP re-test for edit_prompt.

## Tests

### 1. image_op extract_subject from Claude Code
expected: "Returns success true with output, runId, trace.nodes[0].output, and the saved PNG is a clean alpha cutout"
result: passed

Re-test evidence:
- response: success=true
- output: /Users/benlamm/Downloads/generated-images/2026-05-01-imgly-local-extract-subject-imgly-local-942e40.png
- runId: run-2026-05-01T22-15-02-771Z-b905b8
- trace.nodes[0].output present
- file is a 1024x1024 PNG; PIL alpha extrema (0, 254) confirm transparency
- provider-name filename sanitization fix from prior round held

### 2. image_op edit_prompt from Claude Code with OPENAI_API_KEY configured
expected: "Returns success true with output, runId, trace.nodes[0].output, and the saved image reflects the requested GPT Image prompt edit"
result: failed

Re-test evidence:
- response: success=false
- error: "The model '${OPENAI_EDIT_MODEL}' does not exist."
- runId: run-2026-05-01T22-15-17-842Z-4bb3a5
- root cause: `.mcp.json` declares `"OPENAI_EDIT_MODEL": "${OPENAI_EDIT_MODEL}"`. With the parent shell var unset, MCP passes the literal string `${OPENAI_EDIT_MODEL}` to the child process. `process.env.OPENAI_EDIT_MODEL?.trim() || 'gpt-image-1.5'` (src/capabilities/edit-prompt.ts:25) sees a non-empty string and skips the default, so the OpenAI request goes out with model=`${OPENAI_EDIT_MODEL}`.

## Summary

total: 2
passed: 1
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

### 1. Provider names must be filename-safe
status: fixed-confirmed
source: image_op extract_subject UAT
fix: provider names are sanitized before generated filename interpolation; confirmed by passing re-test

### 2. OpenAI edit_prompt must use a GPT Image-compatible JSON edit path
status: fixed-confirmed-via-prior-smoke
source: image_op edit_prompt UAT (prior round)
fix: edit_prompt uses JSON `/v1/images/edits` with image data URL references and default `gpt-image-1.5`; current failure is unrelated (env interpolation, not API path)

### 3. Un-substituted `${OPENAI_EDIT_MODEL}` reaches OpenAI as model name
status: fixed-pending-retest
source: image_op edit_prompt UAT (this round)
symptom: edit_prompt fails with `The model '${OPENAI_EDIT_MODEL}' does not exist.` whenever the parent shell does not export OPENAI_EDIT_MODEL
fix: `.mcp.json` now defaults `OPENAI_EDIT_MODEL` to `gpt-image-1.5`, and `edit-prompt.ts` treats unresolved `${...}` placeholder values as unset before applying defaults
