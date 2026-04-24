# Image Gen MCP

An MCP (Model Context Protocol) server for multi-provider image generation. Works with Claude Code, Claude Desktop, and other MCP-compatible clients.

## Features

- **5 providers** — OpenAI, Google Gemini, Replicate, Together AI, xAI Grok
- **3 tools** — `generate_image`, `process_image`, `generate_asset`
- **Asset presets** — One-call generation of profile pics, post images, hero photos, avatars, and scenes
- **Image processing** — Resize, crop, aspect crop, and circle mask operations
- **Style modifiers** — Prepend style directives (e.g., "watercolor painting") to any prompt
- **Smart defaults** — Configure a default provider, override per-request
- **Persistent output** — Images saved to disk with descriptive filenames, atomic writes

## Supported Providers

| Provider | Models | Notes |
|----------|--------|-------|
| **OpenAI** | `gpt-image-1` (default), `dall-e-3`, `dall-e-2` | Highest quality, supports revised prompts |
| **Google Gemini** | `gemini-2.5-flash-image` (default), `gemini-3-pro-image-preview` | Fast default, pro for higher quality |
| **Replicate** | `black-forest-labs/flux-1.1-pro` (default), any Replicate model | Huge model variety |
| **Together AI** | `black-forest-labs/FLUX.1-schnell` (default) | Fast, affordable |
| **xAI Grok** | `grok-2-image` (default) | Aurora image generation |

## Installation

### Claude Code Plugin (Recommended)

The easiest way to install — no manual config needed:

```bash
# Add the marketplace
claude plugin marketplace add thebenlamm/image-gen-mcp

# Install the plugin
claude plugin install image-gen@image-gen-marketplace
```

The plugin automatically registers the MCP server. You just need to set your API keys as environment variables (at least one):

```bash
export OPENAI_API_KEY=sk-...
export GEMINI_API_KEY=...
export REPLICATE_API_TOKEN=...
export TOGETHER_API_KEY=...
export XAI_API_KEY=...
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
        "OPENAI_API_KEY": "sk-...",
        "GEMINI_API_KEY": "...",
        "REPLICATE_API_TOKEN": "...",
        "TOGETHER_API_KEY": "...",
        "XAI_API_KEY": "..."
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
        "OPENAI_API_KEY": "sk-..."
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
| `GEMINI_API_KEY` | Google AI Studio API key | - |
| `REPLICATE_API_TOKEN` | Replicate API token | - |
| `TOGETHER_API_KEY` | Together AI API key | - |
| `XAI_API_KEY` | xAI API key | - |

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

## Tool Reference

### `generate_image`

Generate an image from a text prompt.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Text description of the image to generate |
| `provider` | string | No | `openai`, `gemini`, `replicate`, `together`, `grok` |
| `model` | string | No | Provider-specific model (see table below) |
| `size` | string | No | `square` (default), `landscape`, `portrait` |
| `style` | string | No | Style modifier prepended to prompt (e.g., `"watercolor painting"`, `"pixel art"`) |
| `outputPath` | string | No | Exact output file path (must end in `.png`) |
| `outputDir` | string | No | Output directory (filename auto-generated) |

#### Provider-Specific Models

| Provider | Available Models |
|----------|-----------------|
| OpenAI | `gpt-image-1`, `dall-e-3`, `dall-e-2` |
| Gemini | `gemini-2.5-flash-image`, `gemini-3-pro-image-preview` |
| Replicate | Any model on Replicate (e.g., `stability-ai/sdxl`) |
| Together | `black-forest-labs/FLUX.1-schnell`, `black-forest-labs/FLUX.1-pro` |
| Grok | `grok-2-image` |

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

#### Size Mappings

| Size | OpenAI | Gemini | Replicate/Together |
|------|--------|--------|-------------------|
| `square` | 1024x1024 | 1:1 | 1:1 |
| `landscape` | 1792x1024 | 16:9 | 16:9 |
| `portrait` | 1024x1792 | 9:16 | 9:16 |

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

## Output Files

Generated images are saved with descriptive filenames:

```
{date}-{provider}-{prompt-slug}-{hash}.png
```

Example: `2026-01-29-openai-cat-astronaut-floating-in-space-a1b2c3.png`

## Troubleshooting

### "No image providers configured"

At least one API key must be set. Check that your environment variables are correctly configured in your MCP settings.

### "Provider 'X' is not available"

The requested provider doesn't have an API key configured. Either:
- Add the API key to your MCP configuration
- Use a different provider that is configured

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
