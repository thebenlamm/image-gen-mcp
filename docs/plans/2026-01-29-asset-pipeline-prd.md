# Image-Gen MCP v2 — Asset Pipeline PRD

**Date:** 2026-01-29
**Author:** Ben Lamm
**Status:** Draft

---

## 1. Overview & Goals

Image-Gen MCP is a personal Model Context Protocol server that provides a complete image asset pipeline — from generation through post-processing — across multiple AI providers. It serves as the single image tool for all Claude Code sessions, eliminating per-project image tooling.

**Current state (v1.0):** Single `generate_image` tool supporting 5 providers (OpenAI, Gemini, Replicate, Together AI, Grok). Generates one image per call, saves to a global output directory. No post-processing, no output path control, no character consistency, no batch operations.

**Target state (v2.0):** A full asset pipeline with:
- **Generation** with provider preferences (Grok first, Gemini fallback), custom output paths, and reference image support for character consistency
- **Post-processing** tools for resize, crop, circular mask, and aspect ratio adjustments
- **Batch generation** for producing all assets a project needs in one operation
- **Asset manifest** tracking what was generated, with what prompt, for reproducibility

**Design principles:**
- Personal tool — opinionated defaults over configuration surface area
- Provider preference: Grok → Gemini → OpenAI → others
- Raw images are the artifact — no database, no cloud storage, just files on disk
- Each tool does one thing well; compose them for complex workflows

---

## 2. Tools & API Surface

The MCP exposes **4 tools** (up from 1 today).

### Tool 1: `generate_image` (enhanced)

Generates a single image from a text prompt. Enhanced from v1 with output path control, reference images, and provider fallback chain.

```typescript
{
  prompt: string              // Required: image description
  provider?: string           // Optional: override default provider
  model?: string              // Optional: provider-specific model
  size?: "square" | "landscape" | "portrait"  // Optional: aspect ratio
  outputPath?: string         // NEW: exact file path for output
  outputDir?: string          // NEW: directory (auto-generates filename)
  referenceImage?: string     // NEW: path to reference image for consistency
  style?: string              // NEW: style modifier ("photorealistic", "illustrated", "cartoon", etc.)
}
```

**Provider fallback chain:** If the preferred provider fails (rate limit, content policy, API error), automatically try the next in the chain: Grok → Gemini → OpenAI → Replicate → Together. Log which provider ultimately succeeded.

**Response:**
```json
{
  "success": true,
  "path": "/project/generated-images/alex-profile.png",
  "provider": "grok",
  "model": "grok-2-image",
  "prompt": "original prompt",
  "revisedPrompt": "...",
  "fallbackUsed": false,
  "originalProvider": "grok"
}
```

### Tool 2: `process_image`

Post-processes an existing image. Handles the common operations needed to turn a raw generation into a usable asset.

```typescript
{
  inputPath: string           // Required: source image path
  outputPath?: string         // Optional: output path (default: overwrites input)
  operations: Array<{         // Required: ordered list of operations
    type: "resize" | "crop" | "circle_mask" | "aspect_crop"
    // resize params
    width?: number
    height?: number
    fit?: "cover" | "contain" | "fill"
    // crop params
    x?: number, y?: number, w?: number, h?: number
    // aspect_crop params
    aspect?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4"
    gravity?: "center" | "top" | "bottom"
    // circle_mask params (no extra params — crops to circle with transparent bg)
  }>
}
```

**Response:**
```json
{
  "success": true,
  "path": "/project/generated-images/alex-avatar.png",
  "originalSize": { "width": 1024, "height": 1024 },
  "outputSize": { "width": 80, "height": 80 },
  "operationsApplied": ["aspect_crop:1:1", "circle_mask", "resize:80x80"]
}
```

### Tool 3: `generate_asset`

High-level tool that combines generation + post-processing in one call. Purpose-built for known asset types.

```typescript
{
  prompt: string              // Required: image description
  assetType: string           // Required: "profile_pic" | "post_image" | "hero_photo" | "avatar" | "scene"
  outputPath?: string         // Optional: where to save
  outputDir?: string          // Optional: directory (auto-generates filename)
  referenceImage?: string     // Optional: reference for consistency
  provider?: string           // Optional: override provider
  style?: string              // Optional: style modifier
}
```

**Asset type presets:**

| Asset Type | Generation Size | Post-Processing | Use Case |
|---|---|---|---|
| `profile_pic` | square | Crop 1:1, circle mask, resize 200x200 | FB/IG/Twitter avatars |
| `post_image` | landscape | Crop 16:9, resize 1200x675 | FB/IG post images |
| `hero_photo` | portrait | Crop 9:16, resize 1080x1920 | Dating profile, full-screen |
| `avatar` | square | Crop 1:1, circle mask, resize 80x80 | Small circular avatars (Venmo, comments) |
| `scene` | landscape | Crop 16:9, resize 1200x675 | Environmental/scene images |

### Tool 4: `generate_batch`

Generates multiple images in one call. For producing all assets a story or project needs at once.

```typescript
{
  assets: Array<{
    id: string                // Unique ID for this asset (e.g., "alex-profile")
    prompt: string
    assetType?: string        // Uses generate_asset presets if provided
    size?: string             // Raw size if no assetType
    outputPath?: string
    referenceImage?: string
  }>
  outputDir?: string          // Default directory for all assets
  provider?: string           // Default provider for all assets
  style?: string              // Default style for all assets
  manifest?: boolean          // Write a manifest.json alongside outputs (default: true)
}
```

**Manifest output** (written to `outputDir/manifest.json`):
```json
{
  "generated": "2026-01-29T18:30:00Z",
  "provider": "grok",
  "assets": [
    {
      "id": "alex-profile",
      "path": "./alex-profile.png",
      "prompt": "...",
      "assetType": "profile_pic",
      "success": true
    }
  ]
}
```

---

## 3. Architecture

### Dependencies

One new dependency for image processing: **sharp**. It's the standard Node.js image library — fast, well-maintained, handles resize/crop/composite/masking without shelling out to ImageMagick.

```json
{
  "dependencies": {
    "sharp": "^0.33.0"
  }
}
```

### Source Structure (v2)

```
src/
├── index.ts                    # MCP server, tool registration (4 tools)
├── providers/
│   ├── index.ts                # Provider interface, registry, fallback chain
│   ├── openai.ts               # (unchanged)
│   ├── gemini.ts               # (unchanged)
│   ├── replicate.ts            # (unchanged)
│   ├── together.ts             # (unchanged)
│   └── grok.ts                 # (unchanged)
├── processing/
│   ├── index.ts                # Processing pipeline orchestrator
│   ├── resize.ts               # Resize operation
│   ├── crop.ts                 # Crop + aspect crop operations
│   └── mask.ts                 # Circle mask (transparent bg)
├── assets/
│   ├── presets.ts              # Asset type definitions (profile_pic, post_image, etc.)
│   ├── batch.ts                # Batch generation orchestrator
│   └── manifest.ts             # Manifest read/write
└── utils/
    ├── image.ts                # File saving, filename generation (existing)
    └── fallback.ts             # Provider fallback chain logic
```

### Key Architectural Decisions

**1. Provider fallback lives in a utility, not in providers themselves.** Each provider stays dumb — it tries once, succeeds or throws. The fallback chain wraps provider calls at the tool handler level. This keeps providers testable and the fallback logic centralized.

**2. Processing operations are composable.** Each operation (resize, crop, mask) is a standalone function that takes a sharp instance and returns a sharp instance. The pipeline chains them:

```typescript
let pipeline = sharp(inputBuffer);
for (const op of operations) {
  pipeline = applyOperation(pipeline, op);
}
const output = await pipeline.toBuffer();
```

**3. `generate_asset` composes the other two tools internally.** It calls the generation logic, then pipes the result through the processing pipeline. Not literally calling MCP tools — sharing the same underlying functions.

**4. Reference images are provider-specific.** Not all providers support image references. The interface adds an optional `referenceImage` to the generate method. Providers that support it (OpenAI, some Replicate models) use it; others ignore it and rely on prompt alone. No error — just graceful degradation.

**5. Batch runs sequentially by default.** Parallel generation risks rate limits and makes error handling messy. Sequential with early-fail-continue semantics: if one asset fails, log it in the manifest and continue with the rest.

### Data Flow

```
generate_asset("profile_pic", prompt, outputPath)
  │
  ├─→ generate(prompt, provider:"grok", size:"square")
  │     ├─→ try grok → success → raw buffer
  │     └─→ grok fails → try gemini → success → raw buffer
  │
  └─→ process(buffer, [aspect_crop:1:1, circle_mask, resize:200x200])
        ├─→ sharp(buffer).extract(...)  // aspect crop
        ├─→ .composite(circleMask)      // circle mask
        ├─→ .resize(200, 200)           // resize
        └─→ .png().toFile(outputPath)   // save
```

---

## 4. Reference Image Strategy

Character consistency is the hardest problem here. No provider offers true "same character, different pose" generation today. But we can get close with a layered approach.

### How It Works

A **reference image** is a previously generated image of a character that gets passed to providers that support image-to-image or edit APIs. The goal: generate Alex's profile pic once, then use that as a reference when generating Alex's dating photo, Alex's post image, etc.

### Provider Support Matrix

| Provider | Reference Support | Mechanism | Quality |
|---|---|---|---|
| **OpenAI** | Yes | Images API edit endpoint — pass source image + prompt describing changes | High consistency |
| **Gemini** | Yes | Multi-modal input — pass image + text prompt together | Moderate consistency |
| **Replicate** | Partial | Model-dependent — Flux IP-Adapter, InstantID, etc. support reference images | Varies by model |
| **Together** | No | Text-only generation API | N/A |
| **Grok** | No | Text-only generation API | N/A |

### Two-Pass Strategy

Grok is the preferred provider, but it doesn't support reference images. This creates a tension: we want Grok for quality/preference, but need reference support for consistency.

**Resolution:**

1. **Hero generation (first image of a character):** Use Grok. No reference needed — this IS the reference.
2. **Subsequent images of the same character:** Use OpenAI or Gemini with the hero image as reference. Override the Grok-first preference when a reference image is provided.

The fallback chain becomes context-dependent:
- **No reference image:** Grok → Gemini → OpenAI → Replicate → Together
- **With reference image:** OpenAI → Gemini → Replicate (only reference-capable providers)

### Provider Interface Change

```typescript
interface ImageProvider {
  name: string;
  generate(params: {
    prompt: string;
    size?: string;
    model?: string;
    referenceImage?: Buffer;     // NEW
    referenceWeight?: number;    // NEW: 0.0–1.0, how closely to match reference
  }): Promise<GenerationResult>;

  supportsReference: boolean;    // NEW: used by fallback chain to filter
}
```

### Reference Weight

A `referenceWeight` parameter (0.0 to 1.0) controls how closely the output should match the reference:

- **0.8–1.0**: Same person, similar composition (profile pic → another profile pic)
- **0.5–0.7**: Same person, different context (profile pic → full body dating photo)
- **0.2–0.4**: Same general vibe/style, not necessarily same person (character → scene they'd be in)

How this maps to provider APIs:
- **OpenAI**: Not directly exposed, controlled by prompt specificity
- **Gemini**: Prompt engineering — "generate an image very similar to the reference" vs "inspired by"
- **Replicate**: Most models expose a `strength` or `ip_adapter_scale` parameter directly

### Practical Workflow for a Story

Generating assets for a story with characters Alex and Jamie:

```
Step 1: Generate hero images (Grok, no references)
  → alex-hero.png   (prompt: "28-year-old man, brown hair, warm smile, casual")
  → jamie-hero.png  (prompt: "26-year-old woman, red hair, confident expression")

Step 2: Generate derived assets (OpenAI/Gemini, with references)
  → alex-profile.png   (ref: alex-hero.png, weight: 0.9, assetType: profile_pic)
  → alex-dating.png    (ref: alex-hero.png, weight: 0.6, assetType: hero_photo)
  → jamie-profile.png  (ref: jamie-hero.png, weight: 0.9, assetType: profile_pic)
  → jamie-dating.png   (ref: jamie-hero.png, weight: 0.6, assetType: hero_photo)

Step 3: Generate scene images (Grok, no references)
  → family-lunch.png   (prompt: "Family lunch at Italian restaurant...", assetType: post_image)
```

### Limitations to Accept

- **Not perfect consistency.** Reference images improve similarity but don't guarantee identical characters across generations. This is a fundamental limitation of current image AI.
- **Style drift between providers.** The hero (Grok) and derivatives (OpenAI/Gemini) will have different artistic styles. Mitigate with explicit style instructions in prompts.
- **No pose control.** We can't say "same person, now looking left." Prompt engineering is the only lever.

These are acceptable for socialstory's use case — the images appear in different frame types (phone, Facebook, dating app) where slight variation is natural.

---

## 5. Configuration & Environment

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `IMAGE_GEN_OUTPUT_DIR` | `~/Downloads/generated-images` | Global default output directory |
| `IMAGE_GEN_DEFAULT_PROVIDER` | `grok` | First provider in fallback chain (changed from `openai`) |
| `IMAGE_GEN_PROVIDER_ORDER` | `grok,gemini,openai,replicate,together` | Full fallback chain order |
| `IMAGE_GEN_REFERENCE_PROVIDER_ORDER` | `openai,gemini,replicate` | Fallback chain when reference image provided |
| `IMAGE_GEN_DEFAULT_STYLE` | _(none)_ | Style modifier applied to all prompts unless overridden |
| `OPENAI_API_KEY` | — | _(unchanged)_ |
| `GEMINI_API_KEY` | — | _(unchanged)_ |
| `REPLICATE_API_TOKEN` | — | _(unchanged)_ |
| `TOGETHER_API_KEY` | — | _(unchanged)_ |
| `XAI_API_KEY` | — | _(unchanged)_ |

### Provider Chain Behavior

The chain is filtered at startup to only include providers with valid API keys. If you set `IMAGE_GEN_PROVIDER_ORDER=grok,gemini,openai` but don't have `XAI_API_KEY`, the effective chain is `gemini,openai`.

Startup logs show the effective chains:

```
[image-gen] Provider chain: grok → gemini → openai
[image-gen] Reference chain: openai → gemini
[image-gen] Providers without keys (skipped): replicate, together
```

### Output Path Resolution

Three levels of output path specificity, highest priority wins:

1. **`outputPath`** on the tool call — exact file path, used as-is
2. **`outputDir`** on the tool call — directory + auto-generated filename
3. **`IMAGE_GEN_OUTPUT_DIR`** env var — global fallback

Auto-generated filenames keep the existing pattern: `{date}-{provider}-{slug}-{hash}.png`

For `generate_asset` and `generate_batch`, the `outputPath` can use the asset ID as the filename:

```
outputDir: "./generated-images"
asset id: "alex-profile"
→ ./generated-images/alex-profile.png
```

No date prefix, no hash — just the ID. Clean, predictable paths that can be referenced in story JSON without guessing filenames.

### MCP Server Config (Updated)

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "node",
      "args": ["/Users/benlamm/Workspace/image-gen-mcp/dist/index.js"],
      "env": {
        "IMAGE_GEN_DEFAULT_PROVIDER": "grok",
        "IMAGE_GEN_PROVIDER_ORDER": "grok,gemini,openai,replicate,together",
        "IMAGE_GEN_REFERENCE_PROVIDER_ORDER": "openai,gemini,replicate",
        "IMAGE_GEN_OUTPUT_DIR": "~/Downloads/generated-images",
        "XAI_API_KEY": "${XAI_API_KEY}",
        "GEMINI_API_KEY": "${GEMINI_API_KEY}",
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "REPLICATE_API_TOKEN": "${REPLICATE_API_TOKEN}",
        "TOGETHER_API_KEY": "${TOGETHER_API_KEY}"
      }
    }
  }
}
```

### What's NOT Configurable

Keeping things opinionated — these are hardcoded, not configurable:

- **Asset type presets** (profile_pic = square + circle mask + 200x200). Change them in code, not env vars.
- **Manifest format.** Always JSON, always `manifest.json` in the output directory.
- **Filename slug generation.** Always lowercase, hyphenated, 50 char max.
- **PNG output format.** Everything is PNG. No JPEG/WebP toggle — PNG handles transparency (needed for circle masks) and quality is not a concern for this use case.

---

## 6. Implementation Phases

Four phases, each delivering usable value. No phase depends on a later one.

### Phase 1: Core Enhancements

Enhance the existing `generate_image` tool without adding new tools.

**Changes:**
- Add `outputPath` and `outputDir` parameters to `generate_image`
- Change default provider from `openai` to `grok`
- Implement provider fallback chain with `IMAGE_GEN_PROVIDER_ORDER`
- Add `style` parameter (appended to prompt: `"{prompt}, {style} style"`)
- Return `fallbackUsed` and `originalProvider` in response

**Validates:** Output path control works, fallback chain is reliable, Grok-first is stable.

### Phase 2: Post-Processing

Add the `process_image` tool and the sharp dependency.

**Changes:**
- Add `sharp` dependency
- Implement `processing/` module with resize, crop, aspect_crop, circle_mask operations
- Register `process_image` tool in MCP server
- Operations are composable — pipeline chains them in order

**Validates:** sharp works in the MCP process, operations produce correct output, circle masks render with transparency.

### Phase 3: Asset Pipeline

Add `generate_asset` — the high-level tool combining generation + processing.

**Changes:**
- Define asset type presets in `assets/presets.ts`
- Implement `generate_asset` tool that calls generation → processing pipeline
- Asset types: `profile_pic`, `post_image`, `hero_photo`, `avatar`, `scene`
- When `outputPath` uses an asset ID, produce clean filenames (no date/hash prefix)

**Validates:** End-to-end pipeline works — one call produces a ready-to-use asset. Presets match socialstory's actual needs.

### Phase 4: Reference Images & Batch

The two remaining features. Grouped because batch is simple plumbing and reference images are the real work.

**Changes:**
- Add `referenceImage` and `referenceWeight` to provider interface
- Implement reference support in OpenAI provider (edit API)
- Implement reference support in Gemini provider (multi-modal input)
- Add `supportsReference` flag to provider interface
- Implement context-dependent fallback chain (reference vs no-reference)
- Add `generate_batch` tool with sequential execution and manifest output
- Manifest tracks prompt, provider, asset type, success/failure per asset

**Validates:** Character consistency noticeably improves with references. Batch generates a full story's assets in one call. Manifest is useful for reproducibility.

---

## 7. Success Criteria

**Phase 1 — Core Enhancements:**
- `generate_image` with `outputPath` saves to the exact specified path
- When Grok fails, the image still generates via Gemini without manual intervention
- Response includes which provider was actually used

**Phase 2 — Post-Processing:**
- `process_image` can take a 1024x1024 image and produce an 80x80 circular PNG with transparent background
- Operations chain correctly: aspect_crop → circle_mask → resize produces expected output
- No visible artifacts at target sizes

**Phase 3 — Asset Pipeline:**
- `generate_asset` with `assetType: "profile_pic"` produces a circular, correctly sized image in one call
- All 5 asset types produce output matching the dimensions in the preset table
- socialstory can use generated assets by referencing paths in story JSON without manual editing

**Phase 4 — Reference Images & Batch:**
- Two images of the same character (one hero, one derived with reference) are recognizably the same person
- `generate_batch` with 5 assets produces all 5 images + a valid manifest.json
- A failed asset in the batch doesn't stop the remaining assets from generating

---

## 8. Out of Scope

Things this PRD explicitly does not cover:

- **Image editing via inpainting.** No "change the background" or "remove this object" — that's a different tool.
- **Video or animation.** Still images only.
- **Cloud storage.** Images go to local disk. No S3, no CDN.
- **User-facing UI.** This is an MCP server consumed by Claude Code. No web interface.
- **Caching or deduplication.** Same prompt generates a new image every time. Manifests provide the audit trail if you need to find what was already generated.
- **Cost tracking.** No per-image cost logging. Check provider dashboards directly.
- **NSFW filtering.** Rely on provider-side content policies. No additional filtering layer.
