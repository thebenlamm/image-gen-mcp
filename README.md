# Image Gen MCP

An MCP (Model Context Protocol) server for multi-provider image generation. Works with Claude Code, Claude Desktop, and other MCP-compatible clients.

## Features

- **5 providers** - OpenAI, Google Gemini, Replicate, Together AI, xAI Grok
- **Unified interface** - Single `generate_image` tool works with all providers
- **Smart defaults** - Configure a default provider, override per-request
- **Persistent output** - Images saved to disk with descriptive filenames
- **Size presets** - Square, landscape, and portrait aspect ratios

## Supported Providers

| Provider | Models | Notes |
|----------|--------|-------|
| **OpenAI** | `gpt-image-1` (default), `dall-e-3`, `dall-e-2` | Highest quality, supports revised prompts |
| **Google Gemini** | `gemini-2.5-flash-image` (default), `gemini-3-pro-image-preview` | Fast default, pro for higher quality |
| **Replicate** | `black-forest-labs/flux-1.1-pro` (default), any Replicate model | Huge model variety |
| **Together AI** | `black-forest-labs/FLUX.1-schnell` (default) | Fast, affordable |
| **xAI Grok** | `grok-2-image` (default) | Aurora image generation |

## Installation

```bash
git clone https://github.com/yourusername/image-gen-mcp.git
cd image-gen-mcp
npm install
npm run build
```

## Configuration

### Claude Code

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
