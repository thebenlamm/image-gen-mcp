# AGENTS.md

Guidance for Codex and other coding agents working in this repository or using this MCP server.

## What This MCP Provides

Image Gen MCP exposes six MCP tools:

- `generate_image` — text-to-image through OpenAI, Gemini, Replicate, Together, or Grok
- `process_image` — local sharp resize/crop/aspect/circle-mask operations
- `generate_asset` — one-call preset asset generation and post-processing
- `image_op` — direct capability invocation by `(op, provider)`
- `image_task` — natural-language image goal handoff with template/Haiku planning and DAG execution
- `list_capabilities` — capability discovery with constraints, cost, latency, and quality

Use `generate_asset` for known preset outputs. Use `image_op` when the operation/provider is explicit. Use `image_task` when the user describes an outcome and wants the MCP to plan and execute the steps.

## Important Runtime Rules

- Responses return filesystem paths and compact metadata, never base64 image data.
- `image_op` and `image_task` write run artifacts under `.runs/<runId>/`.
- `image_task` requires `ANTHROPIC_API_KEY` unless a template fast path matches before planner use.
- Use `dry_run: true` with `image_task` to preview provider routing and estimated cost.
- If `IMAGE_GEN_INPUT_ROOT` is set, input image paths must resolve under that root.
- Provider availability depends on API keys. Call `list_capabilities` when unsure.

## Capability Operations

Supported operation names:

- `extract_subject`
- `edit_prompt`
- `composite_layers`
- `transform`
- `enhance_upscale`
- `analyze_dimensions`
- `analyze_palette`
- `analyze_ocr`
- `generate`

Common providers:

- `@imgly/local`, `openai`, `sharp`, `replicate`, `tesseract`
- `photoroom`, `fal`, `ideogram` when their API keys are configured

## Development Commands

```bash
npm install
npm run build
npm test
npm run eval
npm run check-models
```

## Documentation Expectations

When tool schemas, capability operations, providers, or environment variables change, update:

- `README.md`
- `CLAUDE.md`
- `AGENTS.md`
- `.mcp.json` if default MCP-client env wiring changes

Keep these files aligned with `src/index.ts`, `src/capabilities/types.ts`, and `src/capabilities/register.ts`.
