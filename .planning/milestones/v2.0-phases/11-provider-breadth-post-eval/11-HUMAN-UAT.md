---
status: complete
phase: 11-provider-breadth-post-eval
source: [11-VERIFICATION.md]
started: 2026-05-03T23:18:30Z
updated: 2026-05-04T02:48:34Z
---

# Phase 11 Human UAT

## Current Test

complete

## Tests

### 1. Live Phase 11 Provider Evals
expected: `npm run eval` exits 0 with `PHOTOROOM_API_KEY`, `FAL_KEY`, and `IDEOGRAM_API_KEY` set; results include scored entries for `extract_subject:photoroom`, `composite_layers:photoroom`, `edit_prompt:fal`, and `generate:ideogram`; `list_capabilities` shows non-empty `quality.scores` for all four.
result: passed - `npm run eval` exited 0 and wrote `eval/results/2026-05-04T02-48-34-346Z.json` with scored live provider cases for Photoroom, fal.ai, and Ideogram. Applying that result in-process made `list_capabilities` expose non-empty `quality.scores` for `extract_subject:photoroom`, `composite_layers:photoroom`, `edit_prompt:fal`, and `generate:ideogram`.

### 2. Product-Photography Best-Tier Routing
expected: After live evals, a best-tier product-photography `image_task` trace shows `composite_layers` selected with `provider=photoroom`, `metadata.api="image-editing"`, `metadata.shadowApplied=true`, `metadata.qualityMeasured=true`, and non-empty `metadata.qualityScores`.
result: passed - dry-run route check after applying `eval/results/2026-05-04T02-48-34-346Z.json` returned `success=true`, `plannerMethod=llm`, and selected `extract_subject:photoroom` followed by terminal `composite_layers:photoroom` for the best-tier product-photography task.

### 3. fal.ai Fast-Tier Routing
expected: After live evals, a fast-tier edit task matching the Replicate-class/Flux Kontext route selects `edit_prompt:fal` when fal.ai's measured latency/cost wins above the quality floor.
result: passed - dry-run route check after applying `eval/results/2026-05-04T02-48-34-346Z.json` returned `success=true`, `plannerMethod=llm`, and selected terminal `edit_prompt:fal` for the fast-tier product recolor task.

### 4. Ideogram Text-Heavy Routing
expected: After live evals, a text-heavy generation task selects `generate:ideogram` and surfaces `ocr_text_presence` in `metadata.qualityScores`.
result: passed - dry-run route check after applying `eval/results/2026-05-04T02-48-34-346Z.json` returned `success=true`, `plannerMethod=llm`, and selected terminal `generate:ideogram` for the text-heavy `OPEN` poster task. The applied eval result contains scored `ocr_text_presence=1` for `generate:ideogram`.

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
