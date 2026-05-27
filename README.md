# Image Gen MCP

An MCP (Model Context Protocol) server for multi-provider image generation. Works with Claude Code, Claude Desktop, and other MCP-compatible clients.

## Features

- **8 providers** — OpenAI, Google Gemini, Replicate, Together AI, xAI Grok, Photoroom, fal.ai, Ideogram
- **7 tools** — `generate_image`, `generate_batch`, `process_image`, `generate_asset`, `image_op`, `image_task`, `list_capabilities`
- **Batch generation** — `generate_batch`: submit an array of prompts in one tool call with per-item failure isolation and a batch run manifest
- **Style anchoring** — Pass `reference_image` to `generate_image` or `generate_batch` to anchor scene geometry and lighting; routes transparently through `edit_prompt` (gpt-image-1.5)
- **Goal-shaped MCP tool** — `image_task`: hand off a natural-language image goal, receive the final image plus a structured DAG trace
- **Brand mockup template** — Goal `"brand-mockup"` in `image_task` produces a two-stage plan: AI generates a clean scene (no text), then sharp composites your SVG wordmark over it
- **Routing transparency** — `list_capabilities` surfaces all 6 generate providers (openai, gemini, grok, replicate, together, ideogram) with cost/latency metadata so `image_task` can route by evidence
- **Capability operations** — Directly invoke `extract_subject`, `edit_prompt`, `composite_layers`, `generate`, transform, upscale, and analysis ops through `image_op`
- **Asset presets** — One-call generation of profile pics, post images, hero photos, avatars, and scenes
- **Image processing** — Resize, crop, aspect crop, and circle mask operations
- **Style modifiers** — Prepend style directives (e.g., "watercolor painting") to any prompt
- **Smart defaults** — Configure a default provider, override per-request
- **Persistent output** — Images saved to disk with descriptive filenames, atomic writes

## Supported Providers

| Provider | Models | Notes |
|----------|--------|-------|
| **OpenAI** | `gpt-image-1` (generation default), `gpt-image-2`, `dall-e-3`, `dall-e-2`; `gpt-image-1.5` for `image_op` edits | Highest quality, supports revised prompts. `gpt-image-2` requires OpenAI org verification (verify at https://platform.openai.com/settings/organization/general, wait up to 15 min for propagation), then set `OPENAI_DEFAULT_MODEL=gpt-image-2`. |
| **Google Gemini** | `gemini-2.5-flash-image` (default), `gemini-3-pro-image` | Fast default, pro for higher quality |
| **Replicate** | `black-forest-labs/flux-1.1-pro` (default), any Replicate model | Huge model variety |
| **Together AI** | `black-forest-labs/FLUX.1-schnell` (default) | Fast, affordable |
| **xAI Grok** | `grok-imagine-image` (default), `grok-imagine-image-pro`, `grok-2-image` | Aurora image generation |
| **Photoroom** | Remove Background API; Image Editing API | Capability-only provider for `extract_subject` and `composite_layers` with Image Editing shadows/relighting. Requires `PHOTOROOM_API_KEY`. |
| **fal.ai** | `fal-ai/flux-pro/kontext` | Capability-only `edit_prompt` mirror for Flux Kontext. Requires `FAL_KEY`. |
| **Ideogram** | `ideogram-v3-0` | Capability-only `generate` provider for text-fidelity generation. Requires `IDEOGRAM_API_KEY`. |

## Installation

### Claude Code Plugin (Recommended)

The easiest way to install — no manual config needed:

```bash
# Add the marketplace
claude plugin marketplace add thebenlamm/image-gen-mcp

# Install the plugin
claude plugin install image-gen@image-gen-marketplace
```

The plugin automatically registers the MCP server. Set API keys for the remote providers you want to use. Local `extract_subject` works without an API key:

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_DEFAULT_MODEL=gpt-image-1
export OPENAI_EDIT_MODEL=gpt-image-1.5
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=...
export REPLICATE_API_TOKEN=...
export TOGETHER_API_KEY=...
export XAI_API_KEY=...
export PHOTOROOM_API_KEY=...
export FAL_KEY=...
export IDEOGRAM_API_KEY=...
export IMAGE_GEN_INPUT_ROOT=/absolute/path/to/allowed-inputs
```

Restart Claude Code and the tools will be available.

### Manual Installation

If you prefer manual setup or want to use with other MCP clients:

```bash
git clone https://github.com/thebenlamm/image-gen-mcp.git
cd image-gen-mcp
npm install
```

The `postinstall` script builds automatically. Then configure your client (see below).

## Configuration

### Claude Code (Manual)

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "node",
      "args": ["/absolute/path/to/image-gen-mcp/dist/index.js"],
      "env": {
        "IMAGE_GEN_DEFAULT_PROVIDER": "openai",
        "IMAGE_GEN_OUTPUT_DIR": "~/Downloads/generated-images",
        "IMAGE_GEN_INPUT_ROOT": "/absolute/path/to/allowed-inputs",
        "OPENAI_API_KEY": "sk-...",
        "OPENAI_DEFAULT_MODEL": "gpt-image-1",
        "OPENAI_EDIT_MODEL": "gpt-image-1.5",
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "GEMINI_API_KEY": "...",
        "REPLICATE_API_TOKEN": "...",
        "TOGETHER_API_KEY": "...",
        "XAI_API_KEY": "...",
        "PHOTOROOM_API_KEY": "...",
        "FAL_KEY": "...",
        "IDEOGRAM_API_KEY": "..."
      }
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "node",
      "args": ["/absolute/path/to/image-gen-mcp/dist/index.js"],
      "env": {
        "IMAGE_GEN_DEFAULT_PROVIDER": "openai",
        "IMAGE_GEN_OUTPUT_DIR": "~/Downloads/generated-images",
        "IMAGE_GEN_INPUT_ROOT": "/absolute/path/to/allowed-inputs",
        "OPENAI_API_KEY": "sk-...",
        "OPENAI_DEFAULT_MODEL": "gpt-image-1",
        "OPENAI_EDIT_MODEL": "gpt-image-1.5",
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "GEMINI_API_KEY": "...",
        "REPLICATE_API_TOKEN": "...",
        "TOGETHER_API_KEY": "...",
        "XAI_API_KEY": "...",
        "PHOTOROOM_API_KEY": "...",
        "FAL_KEY": "...",
        "IDEOGRAM_API_KEY": "..."
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `IMAGE_GEN_DEFAULT_PROVIDER` | Provider used when none specified | `openai` |
| `IMAGE_GEN_OUTPUT_DIR` | Directory for saved images | `~/Downloads/generated-images` |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `OPENAI_DEFAULT_MODEL` | OpenAI model used when `model` param is omitted | `gpt-image-1` |
| `OPENAI_EDIT_MODEL` | OpenAI GPT Image model used by `image_op` `edit_prompt` | `gpt-image-1.5` |
| `ANTHROPIC_API_KEY` | Required for `image_task`. API key for Anthropic Claude Haiku planning. Get one from https://console.anthropic.com/. Calls fail clearly when unset. | - |
| `IMAGE_GEN_INPUT_ROOT` | Optional path-validation root for capability input paths. When set, input paths for `extract_subject`, `edit_prompt`, `composite_layers.layers[].input`, `transform`, `enhance_upscale`, and `analyze_*` must resolve under this root; `..` traversal and symlinks outside the root are rejected before invocation. Recommended for `image_task` because the planner can emit paths the user did not type. | unset |
| `GEMINI_API_KEY` | Google AI Studio API key | - |
| `REPLICATE_API_TOKEN` | Replicate API token | - |
| `TOGETHER_API_KEY` | Together AI API key | - |
| `XAI_API_KEY` | xAI API key | - |
| `PHOTOROOM_API_KEY` | Photoroom API key. Enables `extract_subject` through the Remove Background API and `composite_layers` through the Image Editing API with shadow/relighting via `photoroom`. | - |
| `FAL_KEY` | fal.ai API key. Enables `edit_prompt` via `fal` using Flux Kontext as a faster/cheaper mirror to `openai`. | - |
| `IDEOGRAM_API_KEY` | Ideogram Developer API key. Enables `generate` via `ideogram` for text-fidelity generation. | - |

Only configure API keys for providers you want to use. Providers without keys are automatically disabled.

### Checking for new models

Providers regularly release new image models. To see what's currently available
from each provider's API and compare against the defaults this server uses:

```bash
npm run check-models
```

The script queries each provider's `/models` endpoint and prints a report
showing which image-capable models exist and which one is currently the
default in `src/providers/*.ts`. Providers without an API key in your
environment are skipped. Replicate has no simple listing endpoint and is
always skipped — browse https://replicate.com/collections/text-to-image
manually.

This is a read-only report; it never changes any defaults. When you spot a
new model worth adopting, update the relevant provider's `defaultModel` in
`src/providers/*.ts` (and the `KNOWN_DEFAULTS` map in
`scripts/check-models.ts`) by hand.

## Usage

Once configured, restart Claude and ask it to generate images:

### Basic Usage

```
Generate an image of a cat astronaut floating in space
```

### Specify Provider

```
Create an image of a mountain sunset using Gemini
```

```
Use Replicate to generate a photorealistic portrait
```

### Specify Size

```
Generate a landscape image of a beach at golden hour
```

```
Create a portrait-oriented image of a city skyline
```

### Specify Model

```
Generate an image using dall-e-3 of a steampunk robot
```

### Use Style Modifiers

```
Generate a watercolor painting style image of a forest cabin
```

```
Create a pixel art avatar of a wizard
```

### Generate Ready-to-Use Assets

```
Generate a profile picture of a friendly robot
```

```
Create a hero photo of a mountain landscape for my blog
```

### Process Existing Images

```
Crop this image to 16:9 and resize to 1200x675
```

### Invoke Image Operations Directly

```
Extract the subject from /path/to/photo.png using image_op
```

```
Use image_op to edit /path/to/photo.png with OpenAI: change the background to a clean white studio backdrop
```

### Hand Off a Goal to image_task

```
Use image_task with goal "remove the background and place this product on a clean white studio surface, 2000px square" and input_images ["/path/to/product.jpg"]
```

### Generate a Brand Mockup

```
Use image_task with goal "brand-mockup: coffee mug on a warm kitchen counter" and input_images ["/path/to/logo.svg"]
```

The brand-mockup template generates a clean scene (no AI text rendering), then composites your SVG wordmark over it in one plan. Use `dry_run: true` to preview routing before spending credits.

### Batch Generate Multiple Images

```
Use generate_batch with items [{"prompt": "sunset over mountains"}, {"prompt": "misty forest at dawn"}, {"prompt": "coastal cliffs at golden hour"}] and outputDir "/Users/you/Downloads/generated-images"
```

One permission approval, parallel generation, per-item failure isolation. If one item fails the others still complete.

### Anchor Style from a Reference Image

```
Use generate_image with prompt "same scene but with snow" and reference_image "/path/to/original.png"
```

Routes through `edit_prompt:openai` (gpt-image-1.5) to preserve scene geometry and lighting. The response includes `routedVia: "edit_prompt"` and `model: "gpt-image-1.5"` so routing is transparent.

## Tool Reference

### `generate_image`

Generate an image from a text prompt.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Text description of the image to generate |
| `provider` | string | No | `openai`, `gemini`, `replicate`, `together`, `grok` |
| `model` | string | No | Provider-specific model (see table below). Ignored when `reference_image` is set. |
| `size` | string | No | `square` (default), `landscape`, `portrait` |
| `style` | string | No | Style modifier prepended to prompt (e.g., `"watercolor painting"`, `"pixel art"`) |
| `reference_image` | string | No | Path to a reference image. When set, routes through `edit_prompt:openai` (gpt-image-1.5) to anchor scene geometry and lighting. Requires `OPENAI_API_KEY`. |
| `timeout_ms` | integer | No | Per-request HTTP timeout for the `edit_prompt` route (1000–300000 ms, default 90000). Only consulted when `reference_image` is set. |
| `outputPath` | string | No | Exact output file path (must end in `.png`) |
| `outputDir` | string | No | Output directory (filename auto-generated) |

#### Provider-Specific Models

| Provider | Available Models |
|----------|-----------------|
| OpenAI | `gpt-image-2`, `gpt-image-1`, `dall-e-3`, `dall-e-2` |
| Gemini | `gemini-2.5-flash-image`, `gemini-3-pro-image` |
| Replicate | Any model on Replicate (e.g., `stability-ai/sdxl`) |
| Together | `black-forest-labs/FLUX.1-schnell`, `black-forest-labs/FLUX.1-pro` |
| Grok | `grok-imagine-image`, `grok-imagine-image-pro`, `grok-2-image` |

#### Response

```json
{
  "success": true,
  "path": "/Users/you/Downloads/generated-images/2026-01-29-openai-cat-astronaut-a1b2c3.png",
  "provider": "openai",
  "model": "gpt-image-1",
  "revisedPrompt": "A cute orange tabby cat wearing a NASA spacesuit..."
}
```

When `reference_image` is set, the response includes routing metadata:

```json
{
  "success": true,
  "path": "/Users/you/Downloads/generated-images/2026-05-11-openai-scene-with-snow-a1b2c3.png",
  "routedVia": "edit_prompt",
  "referenceImage": "/path/to/original.png",
  "model": "gpt-image-1.5"
}
```

#### Size Mappings

| Size | OpenAI | Gemini | Replicate/Together |
|------|--------|--------|-------------------|
| `square` | 1024x1024 | 1:1 | 1:1 |
| `landscape` | 1792x1024 | 16:9 | 16:9 |
| `portrait` | 1024x1792 | 9:16 | 9:16 |

---

### `generate_batch`

Submit an array of generation requests as a single tool call. One permission approval, parallel execution with a configurable concurrency cap, per-item failure isolation, and a batch-scoped run manifest.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `items` | array | Yes | 1–50 items, each `{ prompt: string, outputPath?: string }` |
| `provider` | string | No | Applies to every item. Same values as `generate_image`. |
| `style` | string | No | Style modifier prepended to every item's prompt |
| `size` | string | No | `square` (default), `landscape`, `portrait` |
| `reference_image` | string | No | Path to a reference image applied to every item. Routes each item through `edit_prompt:openai` (gpt-image-1.5). Requires `OPENAI_API_KEY`. |
| `timeout_ms` | integer | No | Per-request HTTP timeout for each item when `reference_image` is set (1000–300000 ms, default 90000). Each item also retries up to 2× on transient errors (5xx, 429, network) with exponential backoff (1s, 2s). Worst-case wall-clock per item at defaults: ~3 × `timeout_ms` + ~3s backoff (≈273s). Lower `timeout_ms` if your MCP client has a tighter request timeout or you'd rather surface failures faster. |
| `outputDir` | string | No | Default output directory for items without an explicit `outputPath` |
| `max_concurrent` | integer | No | Parallel request cap, 1–8 (default 3) |

#### Response

```json
{
  "batchRunId": "run-2026-05-11T18-21-00-000Z-abc123",
  "status": "success",
  "summary": { "total": 3, "succeeded": 3, "failed": 0 },
  "items": [
    { "index": 0, "success": true, "path": "/path/to/output-0.png", "provider": "openai", "model": "gpt-image-1" },
    { "index": 1, "success": true, "path": "/path/to/output-1.png", "provider": "openai", "model": "gpt-image-1" },
    { "index": 2, "success": true, "path": "/path/to/output-2.png", "provider": "openai", "model": "gpt-image-1" }
  ],
  "manifestPath": "/path/to/.runs/run-.../manifest.json"
}
```

`status` is `"success"` when all items succeed, `"partial"` when some fail, or `"error"` when all fail. Failed items include `"success": false` and a structured `error` object — `{ message: string, code?: string, retryable?: boolean, errorClass?: string }`. When the underlying failure is a `CapabilityInvokeError`, `code` is one of `TIMEOUT | PROVIDER_FAILURE | CONSTRAINT_VIOLATION | UNSUPPORTED | INPUT_TOO_LARGE` and `retryable` indicates whether the request would be safe to retry. Network errors include the underlying class and `code` (e.g. `ECONNRESET`, `UND_ERR_SOCKET`) in `message`. Remaining items always continue regardless.

The per-batch manifest at `.runs/<batchRunId>/manifest.json` mirrors this contract on disk: each failed node has both a human-readable `error: "[CODE] message"` string and a structured `errorDetail: { message, code?, retryable?, errorClass?, suggestion? }`. Prefer `errorDetail` for programmatic access — the `[CODE]` prefix in `error` is a rendering choice and may change. The same `errorDetail` shape is populated on `image_op` and `image_task` manifest/trace nodes for failures, and on the live `image_op` `error` response — one shared structure across the project.

---

### `process_image`

Process an existing image with resize, crop, aspect crop, and circle mask operations. Operations execute in the order specified.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inputPath` | string | Yes | Path to the input image file |
| `operations` | array | Yes | Processing operations to apply in order (see below) |
| `outputPath` | string | No | Output file path (must end in `.png`). Defaults to `{input}_processed.png` |

#### Operations

**resize** — Scale image to target dimensions.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"resize"` | Yes | |
| `width` | integer | No | Target width in pixels |
| `height` | integer | No | Target height in pixels |
| `fit` | string | No | `cover` (default), `contain`, `fill` |
| `withoutEnlargement` | boolean | No | Prevent upscaling beyond source dimensions |

**crop** — Extract a rectangular region.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"crop"` | Yes | |
| `x` | integer | Yes | Left offset in pixels |
| `y` | integer | Yes | Top offset in pixels |
| `width` | integer | Yes | Crop width in pixels |
| `height` | integer | Yes | Crop height in pixels |

**aspectCrop** — Crop to a standard aspect ratio with gravity control.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"aspectCrop"` | Yes | |
| `ratio` | string | Yes | `1:1`, `16:9`, `9:16`, `4:3`, `3:4` |
| `gravity` | string | No | `center` (default), `north`, `south`, `east`, `west` |

**circleMask** — Apply a circular mask with transparent background.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"circleMask"` | Yes | |

#### Response

```json
{
  "success": true,
  "inputPath": "/path/to/input.jpg",
  "outputPath": "/path/to/input_processed.png",
  "originalSize": { "width": 2048, "height": 2048 },
  "outputSize": { "width": 1200, "height": 675 },
  "operationsApplied": ["aspectCrop(16:9, center)", "resize(1200x675, cover)"]
}
```

---

### `generate_asset`

Generate a ready-to-use image asset with automatic post-processing. Combines generation and processing in one call.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Text description of the image to generate |
| `assetType` | string | Yes | Asset preset (see table below) |
| `provider` | string | No | `openai`, `gemini`, `replicate`, `together`, `grok` |
| `model` | string | No | Provider-specific model |
| `style` | string | No | Style modifier prepended to prompt |
| `assetId` | string | No | Clean filename identifier (e.g., `"my-avatar"` → `my-avatar.png`) |
| `outputPath` | string | No | Exact output file path (must end in `.png`) |
| `outputDir` | string | No | Output directory |

#### Asset Presets

| Type | Output | Pipeline |
|------|--------|----------|
| `profile_pic` | 200x200, circular | Square gen → 1:1 crop → circle mask → resize |
| `post_image` | 1200x675, 16:9 | Landscape gen → 16:9 crop → resize |
| `hero_photo` | 1080x1920, 9:16 | Portrait gen → 9:16 crop → resize (no upscaling) |
| `avatar` | 80x80, circular | Square gen → 1:1 crop → circle mask → resize |
| `scene` | 1200x675, 16:9 | Landscape gen → 16:9 crop → resize |

Each preset automatically selects the best generation size for the provider and applies a sequence of post-processing operations to produce a consistent output.

#### Response

```json
{
  "success": true,
  "path": "/Users/you/Downloads/generated-images/my-avatar.png",
  "provider": "openai",
  "model": "gpt-image-1",
  "assetType": "avatar",
  "outputSize": { "width": 80, "height": 80 },
  "operationsApplied": ["aspectCrop(1:1, center)", "circleMask", "resize(80x80, cover)"]
}
```

If post-processing fails, the raw generated image is saved as a fallback with a `warning` field in the response.

---

### `image_op`

Invoke a registered image capability directly by operation and provider. This is useful for targeted image operations that are not pure text-to-image generation.

#### Current Capabilities

| Operation | Provider | Requires | Description |
|-----------|----------|----------|-------------|
| `extract_subject` | `@imgly/local` | `params.input` | Removes the background from a local image using `@imgly/background-removal-node`. No API key required. |
| `extract_subject` | `photoroom` | `PHOTOROOM_API_KEY`, `params.input` | Removes the background using Photoroom Remove Background API. Produces a flat alpha cutout; shadow output is handled by `composite_layers:photoroom`. |
| `edit_prompt` | `openai` | `OPENAI_API_KEY`, `params.input`, `params.prompt` | Edits a local image using OpenAI GPT Image through the JSON Images API. Defaults to `OPENAI_EDIT_MODEL=gpt-image-1.5`. |
| `edit_prompt` | `fal` | `FAL_KEY`, `params.input`, `params.prompt` | Edits a local image using fal.ai Flux Kontext (`fal-ai/flux-pro/kontext`). |
| `composite_layers` | `sharp` | `params.canvas`, `params.layers[]` | Deterministic local PNG composition using sharp. |
| `composite_layers` | `photoroom` | `PHOTOROOM_API_KEY`, `params.canvas`, `params.layers[]` | Single-subject product composition through Photoroom Image Editing API. Accepts `params.canvas`, exactly ONE entry in `params.layers`, optional `params.shadow.enabled` for shadow/relighting, optional `params.canvas.background` RGB color, and optional `params.background.color`/`params.background.prompt`. Rejects per-layer placement fields (`x`, `y`, `scale`, `opacity`, `anchor`) because Photoroom's API does not consume them; use `composite_layers:sharp` for placement. Delivers PROV-01's `(with shadow)` qualifier through Image Editing shadow. |
| `generate` | `ideogram` | `IDEOGRAM_API_KEY`, `params.prompt` | Generates a PNG through Ideogram 3.0 and downloads the ephemeral image URL. |
| `generate` | `openai` | `OPENAI_API_KEY`, `params.prompt` | Generates a PNG through OpenAI gpt-image-1. |
| `generate` | `gemini` | `GEMINI_API_KEY`, `params.prompt` | Generates a PNG through Gemini. |
| `generate` | `grok` | `XAI_API_KEY`, `params.prompt` | Generates a PNG through xAI Grok. Prompt must be ≤ 1024 characters. |
| `generate` | `replicate` | `REPLICATE_API_TOKEN`, `params.prompt` | Generates a PNG through Replicate. |
| `generate` | `together` | `TOGETHER_API_KEY`, `params.prompt` | Generates a PNG through Together AI. |
| `transform` | `sharp` | `params.input`, `params.operations[]` | Applies deterministic local transforms such as resize, crop, rotate, flip, blur, sharpen, grayscale, and format conversion. |
| `enhance_upscale` | `replicate` | `REPLICATE_API_TOKEN`, `params.input` | Runs a Replicate image upscaler/enhancer and downloads the resulting image. |
| `analyze_dimensions` | `sharp` | `params.input` | Reads image dimensions and metadata locally. |
| `analyze_palette` | `sharp` | `params.input` | Extracts dominant color information locally. |
| `analyze_ocr` | `tesseract` | `params.input` | Runs local OCR and returns detected text metadata. |

Photoroom, fal, and Ideogram are exposed through `image_op` once their API keys are present. `image_task` uses eval-populated `quality.scores` when choosing among competing providers. The Photoroom `composite_layers` adapter delivers the `(with shadow)` qualifier through the Image Editing API; the `extract_subject` adapter uses the simpler Remove Background API and produces a flat alpha cutout.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `op` | string | Yes | Operation name: `extract_subject`, `edit_prompt`, `composite_layers`, `transform`, `enhance_upscale`, `analyze_dimensions`, `analyze_palette`, `analyze_ocr`, or `generate`. |
| `provider` | string | Yes | Capability provider. Use `list_capabilities` to see registered pairs such as `@imgly/local`, `openai`, `sharp`, `replicate`, `tesseract`, `photoroom`, `fal`, or `ideogram`. |
| `params` | object | No | Operation-specific parameters. |
| `outputPath` | string | No | Exact output file path (must end in `.png`). |
| `outputDir` | string | No | Output directory (filename auto-generated). |

#### `extract_subject` Params

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `input` | string | Yes | Absolute or relative path to the source image. |

Example:

```json
{
  "op": "extract_subject",
  "provider": "@imgly/local",
  "params": {
    "input": "/Users/you/Pictures/photo.png"
  },
  "outputDir": "/Users/you/Downloads/generated-images"
}
```

#### `edit_prompt` Params

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `input` | string | Yes | Absolute or relative path to the source image. |
| `prompt` | string | Yes | Edit instruction, up to 4000 characters. |
| `size` | string | No | `square`, `landscape`, or `portrait`. |

Example:

```json
{
  "op": "edit_prompt",
  "provider": "openai",
  "params": {
    "input": "/Users/you/Pictures/photo.png",
    "prompt": "Change the background to a clean white studio backdrop",
    "size": "square"
  },
  "outputDir": "/Users/you/Downloads/generated-images"
}
```

#### Response

```json
{
  "success": true,
  "output": "/Users/you/Downloads/generated-images/2026-05-01-openai-edit-prompt-openai-a1b2c3.png",
  "runId": "run-2026-05-01T22-20-57-411Z-22e913",
  "trace": {
    "nodes": [
      {
        "id": "n1",
        "op": "edit_prompt",
        "provider": "openai",
        "model": "gpt-image-1.5",
        "output": "/Users/you/Downloads/generated-images/2026-05-01-openai-edit-prompt-openai-a1b2c3.png",
        "latencyMs": 21400
      }
    ]
  }
}
```

---

### `list_capabilities`

Lists the registered `(op, provider)` pairs available in the current process, including provider constraints, latency/cost hints, and eval-populated quality scores when available. Use this tool before calling `image_op` if provider availability may depend on API keys or local optional binaries.

As of v2.1, all six text-to-image providers appear as `(generate, provider)` rows alongside the existing op capabilities. This lets `image_task` route generate nodes using cost/latency evidence, and gives you a single place to see every capability the server can invoke.

---

### `image_task`

Hand off a natural-language image goal and receive a final image plus a structured trace. The MCP plans a DAG of capability invocations using Anthropic Claude Haiku, validates it, executes it, and returns paths only — never base64.

**Requires `ANTHROPIC_API_KEY`.**

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `goal` | string | Yes | Natural-language description of the desired image outcome |
| `input_images` | string[] | No | Absolute paths to input images. Validated against `IMAGE_GEN_INPUT_ROOT` when set |
| `constraints` | object | No | `{output_size, output_format, quality_tier, budget_cap_usd, latency_cap_seconds, style_refs}` |
| `dry_run` | boolean | No | When true, return the validated plan and estimated totals without invoking any provider |
| `runId` | string | No | Reuse an existing runId; otherwise auto-generated |
| `outputDir` / `outputPath` | string | No | Standard output rules apply |

#### Dry-Run Preview

Set `dry_run: true` to see the validated plan without paying for any provider call. This is useful for checking provider routing and estimated cost before execution.

#### Budget Cap

Set `constraints.budget_cap_usd` to enforce a maximum estimated cost. If the plan exceeds the cap, the call returns `BUDGET_CAP_EXCEEDED` before any provider is called. The error includes `estimated_cost_usd` and `cap_usd`.

#### Response Shape

```json
{
  "success": true,
  "output": { "path": "/path/to/final.png", "mimeType": "image/png" },
  "runId": "run_20260503_120000_abcdef",
  "total_cost_usd": 0.04,
  "total_latency_ms": 8200,
  "plan": {
    "goal": "...",
    "terminalNodeId": "transform",
    "steps": [
      { "id": "extract", "op": "extract_subject", "provider": "@imgly/local", "dependsOn": [] }
    ]
  },
  "trace": [
    {
      "id": "nextract",
      "op": "extract_subject",
      "provider": "@imgly/local",
      "status": "success",
      "output_path": "/path/to/.runs/run_.../nextract.png",
      "cost_usd": 0,
      "latency_ms": 1100
    }
  ]
}
```

The trace always returns filesystem paths only — never base64 image data. Intermediate artifacts live under `<outputDir>/.runs/<runId>/`.

#### Provider Breadth Evals

Run the provider evals after configuring provider keys:

```bash
PHOTOROOM_API_KEY=... FAL_KEY=... IDEOGRAM_API_KEY=... npm run eval
```

These cases use deterministic scorers only. Photoroom `extract_subject` uses `alpha_coverage` and `pixel_delta` for subject and edge preservation. Photoroom `composite_layers` runs through the Image Editing API with `params.shadow.enabled: true` and is scored with `alpha_coverage` on the Photoroom output. The routing question is "did Photoroom produce a clean alpha-aware product composite with shadow/relighting?" — the input baseline used by `pixel_delta` was removed because the adapter does not consume `params.input`; alpha_coverage measures the same routing signal directly on the Photoroom output. This is where PROV-01's `(with shadow)` qualifier is satisfied per D-15. fal Flux Kontext mirrors existing OpenAI `edit_prompt` fixtures and uses `pixel_delta` plus `ocr_text_presence` for instruction success on text edits. Ideogram `generate` uses `ocr_text_presence` with `expectedText` to measure text fidelity.

`image_op` allows immediate direct exploration of registered providers once API keys are present. `image_task` planner preference requires eval-populated `quality.scores`; a second provider should show either a `>=0.03` relevant quality-score edge or a `>=20%` latency/cost edge above the acceptable quality floor before displacing an incumbent.

Trace metadata explains routing decisions:

- `metadata.qualityMeasured`: whether the selected capability has eval scores.
- `metadata.qualityScores`: the scorer values used for route comparison.
- `metadata.noIncumbentComparison`: emitted when the provider is the only registered provider for its op.
- `metadata.qualityUnavailable`: emitted when no legal provider for the op has measured quality.
- Photoroom also reports `metadata.api` (`remove-background` or `image-editing`) and `metadata.shadowApplied` so users can verify which Photoroom path ran.

Example Photoroom composite trace node:

```json
{
  "id": "n1",
  "op": "composite_layers",
  "provider": "photoroom",
  "outcome": "success",
  "metadata": {
    "provider": "photoroom",
    "modelVersion": "photoroom-image-editing-v1",
    "api": "image-editing",
    "shadowApplied": true,
    "qualityMeasured": true,
    "qualityScores": { "alpha_coverage": 0.95 }
  }
}
```

#### Live Human Verification

Run this when verifying provider-breadth routing with real provider credentials:

```bash
# 1. Run all provider-breadth evals (Photoroom extract + composite, fal Flux Kontext, Ideogram).
PHOTOROOM_API_KEY=sk-... \
FAL_KEY=fal_... \
IDEOGRAM_API_KEY=... \
npm run eval

# 2. Confirm the registry now shows quality.scores for all four provider-breadth surfaces.
npm run start &
# In another terminal, send a list_capabilities MCP request through your client and
# confirm extract_subject:photoroom, composite_layers:photoroom, edit_prompt:fal,
# and generate:ideogram each have a non-empty quality.scores object.

# 3. Drive a product-photography best-tier image_task and inspect the trace.
#    From your MCP client, call image_task with:
#      { goal: "product photo on a clean white surface with soft shadow",
#        input_images: ["/path/to/product.jpg"],
#        constraints: { quality_tier: "best" } }
#    Confirm the returned trace shows composite_layers selected with
#    provider=photoroom, metadata.qualityMeasured=true, metadata.api="image-editing",
#    metadata.shadowApplied=true, and a non-empty metadata.qualityScores.
```

If step 1 produces a `case→adapter contract mismatch` error for any case, the case JSON in `eval/cases/` does not match the resolved adapter's `constraints.requiresInputImage` declaration. Fix the case (remove orphan `params.input` or change scorers/adapter contract) before re-running. The lint exists to make this loud rather than silently populate an invalid `quality.score`.

After a successful eval run, `list_capabilities` shows populated `quality.scores` for `extract_subject:photoroom`, `composite_layers:photoroom`, `edit_prompt:fal`, and `generate:ideogram`. PROV-01 is satisfied by two Photoroom adapters: `extract_subject` uses the Remove Background API and produces a flat alpha cutout; `composite_layers:photoroom` uses the Image Editing API on a single subject with shadow/relighting and is scored with `alpha_coverage`. The case `composite-photoroom-product-with-shadow` exercises this path with `params.shadow.enabled: true` and `metadata.shadowApplied: true` on the invoke return. PROV-05 (each new provider has at least one valid eval case) holds for all four Phase 11 capability surfaces.

#### Best-Partial on Failure

If a node fails mid-execution, downstream nodes whose dependencies cannot be satisfied are skipped. The response includes `bestPartial: {nodeId, path}` for the latest successful image-producing node, `failedNodeId` for the failed node, and a structured `error: {message, code, retryable, suggestion}` on that trace entry.

## Output Files

Generated images are saved with descriptive filenames:

```
{date}-{provider}-{prompt-slug}-{hash}.png
```

Example: `2026-01-29-openai-cat-astronaut-floating-in-space-a1b2c3.png`

Provider names are sanitized before filename generation, so capability providers such as `@imgly/local` produce safe filenames like `2026-05-01-imgly-local-extract-subject-imgly-local-a1b2c3.png`.

## Troubleshooting

### "No image providers or capabilities configured"

No generation provider or local capability registered at startup. Rebuild the project and check the MCP server logs. Remote generation and OpenAI edits require API keys, but local `extract_subject` should register without one.

### "Provider 'X' is not available"

The requested provider doesn't have an API key configured. Either:
- Add the API key to your MCP configuration
- Use a different provider that is configured

### "Capability not registered"

`image_op` could not find the requested `(op, provider)` pair. Check the provider name exactly:
- `extract_subject` uses `@imgly/local`
- `edit_prompt` uses `openai` and requires `OPENAI_API_KEY`
- Provider-breadth capabilities require their own API keys: `PHOTOROOM_API_KEY`, `FAL_KEY`, or `IDEOGRAM_API_KEY`

### "The model '${OPENAI_EDIT_MODEL}' does not exist"

Restart your MCP client so it reloads the current `.mcp.json`. The config now defaults `OPENAI_EDIT_MODEL` to `gpt-image-1.5`, and the server treats unresolved `${...}` placeholders as unset before applying defaults.

### Images not appearing

1. Check the output directory exists and is writable
2. Look for error messages in the MCP server logs
3. Verify the `IMAGE_GEN_OUTPUT_DIR` path is correct

### API Errors

Each provider has different rate limits and content policies:
- **OpenAI**: Check your API quota at platform.openai.com
- **Gemini**: Check your quota at ai.google.dev
- **Replicate**: Check your usage at replicate.com
- **Together**: Check your usage at together.ai
- **xAI**: Check your usage at x.ai

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run directly (for testing)
OPENAI_API_KEY=sk-... node dist/index.js
```

## License

MIT
