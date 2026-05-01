# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Image Gen MCP is a Model Context Protocol server that provides unified image generation across multiple AI providers: OpenAI, Google Gemini, Replicate, Together AI, and xAI Grok.

## Commands

```bash
npm install      # Install dependencies
npm run build    # Compile TypeScript to dist/
npm run dev      # Watch mode for development
npm run start    # Run the compiled server
```

## Architecture

```
src/
├── index.ts              # MCP server entry point, tool registration
├── providers/
│   ├── index.ts          # Provider interface, registry
│   ├── openai.ts         # OpenAI (gpt-image-2, gpt-image-1, DALL-E)
│   ├── gemini.ts         # Google Gemini (Imagen)
│   ├── replicate.ts      # Replicate (FLUX, SD, etc.)
│   ├── together.ts       # Together AI (FLUX)
│   └── grok.ts           # xAI Grok (Aurora)
└── utils/
    └── image.ts          # File saving, filename generation
```

### Key Patterns

**Provider Interface**: All providers implement `ImageProvider` with a `generate()` method returning a `Buffer`. This abstraction allows the MCP tool to work identically across providers.

**Provider Registry**: Providers self-register at startup if their API key is present. Missing keys simply skip registration rather than throwing errors.

**Unified Tool**: Single `generate_image` tool handles all providers. The `provider` parameter routes to the correct implementation.

## Adding a New Provider

1. Create `src/providers/{name}.ts` implementing `ImageProvider`
2. Export a `create{Name}Provider()` factory that returns `null` if API key missing
3. Import and register in `src/index.ts`
4. Add to the provider enum in the tool schema
5. Document in README.md

## Environment Variables

- `IMAGE_GEN_DEFAULT_PROVIDER` - Default provider (default: `openai`)
- `IMAGE_GEN_OUTPUT_DIR` - Output directory (default: `~/Downloads/generated-images`)
- `OPENAI_DEFAULT_MODEL` - OpenAI model used when `model` param is omitted (default: `gpt-image-1`; set to `gpt-image-2` once org verification is enabled at https://platform.openai.com/settings/organization/general)
- `OPENAI_EDIT_MODEL` - OpenAI GPT Image model used by `image_op` `edit_prompt` (default: `gpt-image-1.5`)
- Provider API keys: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `REPLICATE_API_TOKEN`, `TOGETHER_API_KEY`, `XAI_API_KEY`

## Testing

To test locally without MCP client:

```bash
# Set at least one API key
export OPENAI_API_KEY=sk-...

# Run server (will wait for MCP messages on stdin)
node dist/index.js
```

For integration testing, configure in Claude Code and use natural language prompts.
