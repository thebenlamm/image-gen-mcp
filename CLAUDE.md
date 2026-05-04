# CLAUDE.md

This file provides guidance to Claude Code when working with this repository and when using the Image Gen MCP server.

## Project Overview

Image Gen MCP is a Model Context Protocol server for image generation, editing, compositing, analysis, and goal-shaped image workflows.

It exposes:

- v1 tools: `generate_image`, `process_image`, `generate_asset`
- v2 direct capability tool: `image_op`
- v2 goal handoff tool: `image_task`
- discovery tool: `list_capabilities`

Prefer `generate_asset` for known asset presets and predictable output. Prefer `image_task` when the user gives a goal that naturally needs multiple steps, routing, or provider choice. Prefer `image_op` when you know the exact operation/provider pair to invoke or need to inspect/debug a capability directly.

## Commands

```bash
npm install      # Install dependencies
npm run build    # Compile TypeScript to dist/
npm run dev      # Watch mode for development
npm run start    # Run the compiled server
npm test         # Run Vitest suite
npm run eval     # Run capability eval harness
npm run check-models # Inspect provider model listings
```

## Architecture

```text
src/
├── index.ts              # MCP server entry point and tool registration
├── providers/            # v1 text-to-image providers
├── capabilities/         # v2 capability registry and provider adapters
├── task/                 # image_task planner, templates, validation, executor
├── eval/                 # golden cases, scorers, result application
├── runs/                 # run IDs, manifests, retention, trace contracts
└── utils/                # image IO, processing, OCR, path input-root guard
```

### Key Patterns

**Provider Interface:** v1 providers implement `ImageProvider.generate()` and power `generate_image` / `generate_asset`.

**Capability Registry:** v2 operations are registered as `(op, provider)` capabilities. This is parallel to `ImageProvider`, so extract-only, edit-only, analysis, and provider-specific operations do not need fake generation methods.

**Tool Surface:**

- `generate_image`: raw text-to-image generation through OpenAI, Gemini, Replicate, Together, or Grok.
- `process_image`: local sharp post-processing.
- `generate_asset`: text-to-image plus preset processing.
- `image_op`: direct registered capability invocation.
- `image_task`: natural-language goal -> template or Haiku plan -> validated DAG -> execution.
- `list_capabilities`: available `(op, provider)` pairs with constraints, cost, latency, and quality.

**Output Contract:** MCP responses return paths and compact metadata only. `image_op` and `image_task` create run artifacts under `.runs/<runId>/` and never return base64 image data.

**Eval-Gated Routing:** Second providers for an op need measured eval scores or an explicit unscored-production justification. `image_task` should route using `quality.scores` when available.

## Available Capabilities

Current operation names:

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

- `@imgly/local` for local `extract_subject`
- `openai` for `edit_prompt`
- `sharp` for local `transform`, `composite_layers`, dimensions, and palette
- `replicate` for `enhance_upscale`
- `tesseract` for OCR
- `photoroom` for `extract_subject` and single-subject `composite_layers`
- `fal` for Flux Kontext `edit_prompt`
- `ideogram` for text-fidelity `generate`

Call `list_capabilities` before using `image_op` if provider availability depends on API keys.

## Using The MCP From Claude Code

Examples:

```text
Generate a profile picture of a friendly robot.
```

```text
Use image_op to extract the subject from /Users/me/Pictures/product.png with provider @imgly/local.
```

```text
Use image_task with goal "remove the background and place this product on a clean white studio surface with a soft shadow, 2000px square" and input_images ["/Users/me/Pictures/product.jpg"].
```

For `image_task`, use `dry_run: true` when the user wants to preview routing, estimated cost, or provider choice before spending provider credits.

## Adding a New Provider

For v1 text-to-image generation:

1. Create `src/providers/{name}.ts` implementing `ImageProvider`.
2. Export a `create{Name}Provider()` factory that returns `null` if the API key is missing.
3. Register in `src/providers/index.ts`.
4. Add the provider enum value in `src/index.ts` tool schemas.
5. Update README and this file.

For v2 capability-only providers, add a capability instead.

## Adding a New Capability

1. Add or update operation types in `src/capabilities/types.ts` and `src/task/plan-schema.ts` if the op is new.
2. Implement a factory returning `Capability | null` when credentials are unavailable.
3. Register it in `src/capabilities/register.ts`.
4. Add pre-invocation validation in `src/capabilities/validation.ts` when needed.
5. Add eval cases before allowing production routing for second providers.
6. Add unit/integration coverage and update README / `CLAUDE.md` / `AGENTS.md`.

## Environment Variables

- `IMAGE_GEN_DEFAULT_PROVIDER` - Default v1 provider, default `openai`
- `IMAGE_GEN_OUTPUT_DIR` - Output directory, default `~/Downloads/generated-images`
- `IMAGE_GEN_RUN_RETENTION_HOURS` - Run artifact retention, default 24
- `IMAGE_GEN_INPUT_ROOT` - Optional containment root for input image paths
- `OPENAI_API_KEY`
- `OPENAI_DEFAULT_MODEL` - Default `gpt-image-1`; `gpt-image-2` requires org verification
- `OPENAI_EDIT_MODEL` - Default `gpt-image-1.5`
- `ANTHROPIC_API_KEY` - Required for non-template `image_task` planning
- `GEMINI_API_KEY`
- `REPLICATE_API_TOKEN`
- `TOGETHER_API_KEY`
- `XAI_API_KEY`
- `PHOTOROOM_API_KEY`
- `FAL_KEY`
- `IDEOGRAM_API_KEY`

Providers without keys are skipped at startup. Local capabilities such as `@imgly/local`, sharp, and tesseract do not require remote API keys.

## Testing

```bash
npm run build
npm test
```

Run provider evals only when the needed API keys are configured:

```bash
PHOTOROOM_API_KEY=... FAL_KEY=... IDEOGRAM_API_KEY=... npm run eval
```

## Planning State

v2.0 is archived. Active roadmap/requirements for the next milestone should be created with `$gsd-new-milestone`.
