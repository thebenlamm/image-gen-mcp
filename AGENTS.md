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

## Mockup Workflow

`image_task` with goal `"brand-mockup"` triggers a deterministic template that separates scene generation from wordmark compositing. The generate step receives a prompt with explicit negative typography instructions so the AI model produces a clean scene with no text. The SVG wordmark is then placed over the scene using `composite_layers:sharp`, preserving pixel-perfect type fidelity without relying on the AI to render lettering.

Pass the SVG path as `input_images[0]`. The composite node places the wordmark at bottom-left (30% scale, 40px padding) by default. Example with `dry_run: true` to preview the plan before executing:

```json
{
  "goal": "brand-mockup",
  "input_images": ["/Users/me/brand/wordmark.svg"],
  "constraints": { "output_size": "square" },
  "dry_run": true
}
```

For precise wordmark placement (custom `x`, `y`, `anchor`, `scale`), use `image_op` with `composite_layers:sharp` directly after generating the scene. The template requires `OPENAI_API_KEY` for the generate step; `composite_layers:sharp` runs locally with no API key.

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
