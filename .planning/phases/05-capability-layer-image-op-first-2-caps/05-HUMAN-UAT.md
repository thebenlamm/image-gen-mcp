---
status: passed
phase: 05-capability-layer-image-op-first-2-caps
source: [05-VERIFICATION.md]
started: 2026-05-01T21:08:00Z
updated: 2026-05-01T22:21:00Z
---

## Current Test

Re-test from Claude Code MCP completed. Both extract_subject and edit_prompt now pass end-to-end. The `${OPENAI_EDIT_MODEL}` interpolation fix held: edit_prompt resolved to default `gpt-image-1.5` and successfully called the OpenAI edits endpoint.

## Tests

### 1. image_op extract_subject from Claude Code
expected: "Returns success true with output, runId, trace.nodes[0].output, and the saved PNG is a clean alpha cutout"
result: passed

Re-test evidence:
- response: success=true
- output: /Users/benlamm/Downloads/generated-images/2026-05-01-imgly-local-extract-subject-imgly-local-618477.png
- runId: run-2026-05-01T22-20-53-960Z-c937b5
- trace.nodes[0].output present
- file is a 1024x1024 PNG (palette mode with tRNS chunk); RGBA-convert alpha extrema (0, 254) and 646,084 fully transparent pixels confirm background was removed
- provider-name filename sanitization fix from prior round held

### 2. image_op edit_prompt from Claude Code with OPENAI_API_KEY configured
expected: "Returns success true with output, runId, trace.nodes[0].output, and the saved image reflects the requested GPT Image prompt edit"
result: passed

Re-test evidence:
- response: success=true
- output: /Users/benlamm/Downloads/generated-images/2026-05-01-openai-edit-prompt-openai-ab0cd9.png
- runId: run-2026-05-01T22-20-57-411Z-22e913
- trace.nodes[0].output present, model=gpt-image-1.5
- file is a 1024x1024 PNG; latency 21.4s consistent with a real GPT Image edit call
- `${OPENAI_EDIT_MODEL}` placeholder fix from prior round held: model resolved to default `gpt-image-1.5` and OpenAI accepted the request

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

### 1. Provider names must be filename-safe
status: fixed-confirmed
source: image_op extract_subject UAT
fix: provider names are sanitized before generated filename interpolation; confirmed by passing re-test

### 2. OpenAI edit_prompt must use a GPT Image-compatible JSON edit path
status: fixed-confirmed
source: image_op edit_prompt UAT (prior round)
fix: edit_prompt uses JSON `/v1/images/edits` with image data URL references and default `gpt-image-1.5`; confirmed by passing re-test

### 3. Un-substituted `${OPENAI_EDIT_MODEL}` reaches OpenAI as model name
status: fixed-confirmed
source: image_op edit_prompt UAT
symptom: edit_prompt failed with `The model '${OPENAI_EDIT_MODEL}' does not exist.` whenever the parent shell did not export OPENAI_EDIT_MODEL
fix: `.mcp.json` now defaults `OPENAI_EDIT_MODEL` to `gpt-image-1.5`, and `edit-prompt.ts` treats unresolved `${...}` placeholder values as unset before applying defaults; confirmed by passing re-test
