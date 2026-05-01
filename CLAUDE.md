# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Image Gen MCP is a Model Context Protocol server that provides unified image generation across multiple AI providers: OpenAI, Google Gemini, Replicate, Together AI, and xAI Grok.
It also exposes a capability layer through `image_op` for direct image operations such as local subject extraction and OpenAI prompt-based image edits.

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
├── capabilities/
│   ├── types.ts          # Capability operation/invoke contracts
│   ├── registry.ts       # CapabilityRegistry for (op, provider) routing
│   ├── register.ts       # Built-in capability registration
│   ├── extract-subject.ts # @imgly/local subject extraction
│   ├── edit-prompt.ts    # OpenAI GPT Image prompt edits
│   └── validation.ts     # Pre-invocation capability validation
└── utils/
    └── image.ts          # File saving, filename generation
```

### Key Patterns

**Provider Interface**: All providers implement `ImageProvider` with a `generate()` method returning a `Buffer`. This abstraction allows the MCP tool to work identically across providers.

**Provider Registry**: Providers self-register at startup if their API key is present. Missing keys simply skip registration rather than throwing errors.

**Generation Tools**: `generate_image` handles raw text-to-image generation and `generate_asset` combines generation with preset post-processing.

**Capability Layer**: `image_op` routes arbitrary `(op, provider)` pairs through `CapabilityRegistry` without modifying the existing `ImageProvider` interface. Current built-ins are `extract_subject` via `@imgly/local` and `edit_prompt` via `openai`.

**Output Contract**: Capabilities return PNG buffers. `image_op` owns output path resolution, atomic saving, `runId`, and trace response generation.

## Adding a New Provider

1. Create `src/providers/{name}.ts` implementing `ImageProvider`
2. Export a `create{Name}Provider()` factory that returns `null` if API key missing
3. Import and register in `src/index.ts`
4. Add to the provider enum in the tool schema
5. Document in README.md

## Adding a New Capability

1. Add or update operation types in `src/capabilities/types.ts`
2. Implement a factory returning `Capability` or `null` if credentials are unavailable
3. Register it in `src/capabilities/register.ts`
4. Add pre-invocation validation in `src/capabilities/validation.ts` when needed
5. Expose user-facing details in the `image_op` tool description and README.md

## Environment Variables

- `IMAGE_GEN_DEFAULT_PROVIDER` - Default provider (default: `openai`)
- `IMAGE_GEN_OUTPUT_DIR` - Output directory (default: `~/Downloads/generated-images`)
- `OPENAI_DEFAULT_MODEL` - OpenAI model used when `model` param is omitted (default: `gpt-image-1`; set to `gpt-image-2` once org verification is enabled at https://platform.openai.com/settings/organization/general)
- `OPENAI_EDIT_MODEL` - OpenAI GPT Image model used by `image_op` `edit_prompt` (default: `gpt-image-1.5`)
- Provider API keys: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `REPLICATE_API_TOKEN`, `TOGETHER_API_KEY`, `XAI_API_KEY`

## Testing

To test locally without MCP client:

```bash
# Set API keys for remote provider tests
export OPENAI_API_KEY=sk-...

# Run server (will wait for MCP messages on stdin)
node dist/index.js
```

For integration testing, configure in Claude Code and use natural language prompts.
