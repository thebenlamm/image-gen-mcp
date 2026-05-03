---
status: partial
phase: 11-provider-breadth-post-eval
source: [11-VERIFICATION.md]
started: 2026-05-03T23:18:30Z
updated: 2026-05-03T23:18:30Z
---

# Phase 11 Human UAT

## Current Test

awaiting human testing

## Tests

### 1. Live Phase 11 Provider Evals
expected: `npm run eval` exits 0 with `PHOTOROOM_API_KEY`, `FAL_KEY`, and `IDEOGRAM_API_KEY` set; results include scored entries for `extract_subject:photoroom`, `composite_layers:photoroom`, `edit_prompt:fal`, and `generate:ideogram`; `list_capabilities` shows non-empty `quality.scores` for all four.
result: pending

### 2. Product-Photography Best-Tier Routing
expected: After live evals, a best-tier product-photography `image_task` trace shows `composite_layers` selected with `provider=photoroom`, `metadata.api="image-editing"`, `metadata.shadowApplied=true`, `metadata.qualityMeasured=true`, and non-empty `metadata.qualityScores`.
result: pending

### 3. fal.ai Fast-Tier Routing
expected: After live evals, a fast-tier edit task matching the Replicate-class/Flux Kontext route selects `edit_prompt:fal` when fal.ai's measured latency/cost wins above the quality floor.
result: pending

### 4. Ideogram Text-Heavy Routing
expected: After live evals, a text-heavy generation task selects `generate:ideogram` and surfaces `ocr_text_presence` in `metadata.qualityScores`.
result: pending

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
