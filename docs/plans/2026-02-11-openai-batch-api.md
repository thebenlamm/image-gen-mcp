# OpenAI Batch API Integration — Future Plan

**Date:** 2026-02-11
**Status:** Future / Not Started

---

## Overview

OpenAI's [Batch API](https://developers.openai.com/api/docs/guides/batch) supports `/v1/images/generations` and `/v1/images/edits` with **50% cost savings** and higher rate limits. Batches complete within a 24-hour window.

## Relationship to Existing Batch (PRD Phase 4)

The PRD's `generate_batch` tool is **synchronous sequential generation** across any provider — submit N prompts, get N images back immediately. The OpenAI Batch API is fundamentally different: **async, API-level batch** with cost savings but delayed results.

**Recommended approach: separate tools.** They serve different use cases (immediate results vs. cost optimization) and keeping them apart avoids overloading one tool with two different execution models.

## Proposed Tools (OpenAI-only)

| Tool | Purpose |
|------|---------|
| `batch_submit` | Submit N image prompts as a batch. Creates JSONL, uploads to OpenAI Files API, creates batch. Returns `batch_id`. |
| `batch_status` | Poll a batch by ID. Returns status (`validating` / `in_progress` / `completed` / `failed`), completion counts. |
| `batch_results` | Download completed batch results, save images to disk. Returns file paths. |

### Workflow

```
1. batch_submit({
     prompts: [
       {prompt: "...", size: "landscape", model: "gpt-image-1"},
       {prompt: "...", size: "square"},
       ...
     ],
     outputDir: "~/project/assets"
   })
   → {batch_id: "batch_abc123", count: 10}

2. batch_status({batch_id: "batch_abc123"})
   → {status: "in_progress", completed: 3, total: 10}

3. batch_results({batch_id: "batch_abc123", outputDir: "~/project/assets"})
   → {images: [{path: "...", prompt: "..."}, ...], manifest: "manifest.json"}
```

## OpenAI Batch API Details

- **Pricing:** 50% discount vs synchronous API
- **Completion window:** Up to 24 hours
- **Limits:** 50,000 requests per batch, 200 MB file size, 2,000 batches/hour
- **Input format:** JSONL file uploaded via Files API
- **Supported endpoints:** `/v1/images/generations`, `/v1/images/edits`

## Implementation Notes

- Reuse `OpenAIProvider`'s client instance for file uploads and batch management
- Store batch metadata locally (batch_id → output dir mapping) so `batch_results` knows where to save
- Consider a simple JSON file in `IMAGE_GEN_OUTPUT_DIR/.batches/` for tracking active batches
- Post-processing (asset presets) can be applied when retrieving results, not at submit time

## Open Questions

- Should `batch_results` automatically apply asset presets if specified at submit time?
- Worth adding a `batch_list` tool to see all active/recent batches?
- Should batch results integrate with the manifest system from PRD Phase 4?
