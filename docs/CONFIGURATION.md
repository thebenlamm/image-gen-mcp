<!-- generated-by: gsd-doc-writer -->
# Configuration

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `IMAGE_GEN_DEFAULT_PROVIDER` | Optional | `grok` in source; `.mcp.json` wires `openai` as client default | Provider used when no provider is specified for text-to-image generation. Valid values are `openai`, `gemini`, `replicate`, `together`, and `grok`. |
| `IMAGE_GEN_OUTPUT_DIR` | Optional | `~/Downloads/generated-images` | Directory used by output path helpers when an exact output path is not supplied. |
| `IMAGE_GEN_INPUT_ROOT` | Optional | unset | If set, input image paths must resolve under this root for guarded capability and task paths. |
| `IMAGE_GEN_RUN_RETENTION_HOURS` | Optional | `24` | Number of hours to retain `.runs` artifacts before startup cleanup deletes expired runs. |
| `MCP_SSE_PORT` | Optional | unset | Enables SSE transport on the configured port when set. Invalid values fall back to `3101`. |
| `OPENAI_API_KEY` | Required for OpenAI provider and OpenAI edit capability | none | Enables OpenAI image generation and `edit_prompt:openai`. |
| `OPENAI_DEFAULT_MODEL` | Optional | `gpt-image-1` | Default OpenAI generation model. |
| `OPENAI_EDIT_MODEL` | Optional | `gpt-image-1.5` | Default OpenAI image edit model for `edit_prompt:openai`. |
| `ANTHROPIC_API_KEY` | Required for non-template `image_task` planning | none | Enables Anthropic Claude Haiku planning in `src/task/planner.ts`. |
| `GEMINI_API_KEY` | Required for Gemini provider | none | Enables Google Gemini image generation. |
| `REPLICATE_API_TOKEN` | Required for Replicate provider and upscale capability | none | Enables Replicate image generation and `enhance_upscale:replicate`. |
| `TOGETHER_API_KEY` | Required for Together provider | none | Enables Together AI image generation. |
| `XAI_API_KEY` | Required for Grok provider | none | Enables xAI Grok image generation. |
| `PHOTOROOM_API_KEY` | Required for Photoroom capabilities | none | Enables `extract_subject:photoroom` and `composite_layers:photoroom`. |
| `FAL_KEY` | Required for fal capability | none | Enables `edit_prompt:fal`. |
| `IDEOGRAM_API_KEY` | Required for Ideogram capability | none | Enables `generate:ideogram`. |

## Config File Format

The repository includes `.mcp.json` for MCP client wiring. It points clients at the built server and passes environment variables through to the process.

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "IMAGE_GEN_DEFAULT_PROVIDER": "${IMAGE_GEN_DEFAULT_PROVIDER:-openai}",
        "IMAGE_GEN_OUTPUT_DIR": "${IMAGE_GEN_OUTPUT_DIR:-~/Downloads/generated-images}"
      }
    }
  }
}
```

TypeScript build configuration is in `tsconfig.json`. Test configuration is in `vitest.config.ts`.

## Required vs Optional Settings

Provider-specific API keys are not required at install time. Provider factories such as `createOpenAIProvider()`, `createGeminiProvider()`, `createReplicateProvider()`, `createTogetherProvider()`, and `createGrokProvider()` return `null` when their API key is absent, so unavailable providers are skipped during startup.

Direct provider class constructors throw when instantiated without their required key. For example, `OpenAIProvider` throws `OPENAI_API_KEY environment variable is required`, and the Replicate, Gemini, Together, and Grok providers follow the same pattern for their own variables.

`ANTHROPIC_API_KEY` is required only when `image_task` needs planner-backed routing. Template fast paths can run without it when a template matches before planner use.

## Defaults

| Setting | Default | Location |
|---------|---------|----------|
| `IMAGE_GEN_DEFAULT_PROVIDER` | `grok` | `src/index.ts` |
| `IMAGE_GEN_OUTPUT_DIR` | `~/Downloads/generated-images` | `src/utils/image.ts` |
| `IMAGE_GEN_RUN_RETENTION_HOURS` | `24` | `src/runs/retention.ts` |
| `OPENAI_DEFAULT_MODEL` | `gpt-image-1` | `src/providers/openai.ts` |
| `OPENAI_EDIT_MODEL` | `gpt-image-1.5` | `src/capabilities/edit-prompt.ts` |
| `MCP_SSE_PORT` invalid-value fallback | `3101` | `src/index.ts` |

## Per-Environment Overrides

No `.env.example`, `.env.development`, `.env.production`, or `.env.test` file is present in the repository. Local development can use shell exports or a local environment file loaded by the MCP client. The checked-in `.mcp.json` supports shell-style placeholders so users can override provider keys and defaults from their environment.
