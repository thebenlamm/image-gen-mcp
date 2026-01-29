# Image Gen MCP

An MCP server for multi-provider image generation. Works with Claude Code and other MCP-compatible clients.

## Supported Providers

- **OpenAI** - gpt-image-1, DALL-E 3, DALL-E 2
- **Google Gemini** - Imagen 3
- **Replicate** - FLUX, Stable Diffusion, and more
- **Together AI** - FLUX.1
- **xAI Grok** - Aurora

## Installation

```bash
npm install
npm run build
```

## Configuration

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "node",
      "args": ["/path/to/image-gen-mcp/dist/index.js"],
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

Only configure the API keys for providers you want to use.

## Usage

Once configured, ask Claude to generate images:

- "Generate an image of a cat in space"
- "Create an image of a sunset using Gemini"
- "Use Grok to generate a cyberpunk cityscape"

## Tool Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | The image description |
| `provider` | string | No | `openai`, `gemini`, `replicate`, `together`, `grok` |
| `model` | string | No | Provider-specific model override |
| `size` | string | No | `square`, `landscape`, `portrait` |

## License

MIT
