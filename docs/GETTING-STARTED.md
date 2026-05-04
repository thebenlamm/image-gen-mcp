<!-- generated-by: gsd-doc-writer -->
# Getting Started

## Prerequisites

- Node.js with ES module support. The project targets ES2022 and uses NodeNext module resolution in `tsconfig.json`.
- npm, because the repository includes `package.json` and `package-lock.json`.
- API keys for any remote providers you want to use. Local capabilities such as sharp transforms and dimensions analysis can run without remote provider keys.

## Installation Steps

1. Clone the repository:

```bash
git clone https://github.com/thebenlamm/image-gen-mcp.git
cd image-gen-mcp
```

2. Install dependencies:

```bash
npm install
```

The `postinstall` lifecycle script runs `npm run build`, which compiles TypeScript into `dist/`.

3. Configure provider keys as needed:

```bash
export OPENAI_API_KEY=...
export GEMINI_API_KEY=...
export REPLICATE_API_TOKEN=...
export TOGETHER_API_KEY=...
export XAI_API_KEY=...
export ANTHROPIC_API_KEY=...
```

## First Run

Build and start the MCP server:

```bash
npm run build
npm start
```

`npm start` runs `node dist/index.js`, which starts stdio MCP transport by default. To run the SSE transport, pass `--sse` or set `MCP_SSE_PORT`.

## Common Setup Issues

- No providers are available: set at least one of `OPENAI_API_KEY`, `GEMINI_API_KEY`, `REPLICATE_API_TOKEN`, `TOGETHER_API_KEY`, or `XAI_API_KEY`, then restart the server.
- `image_task` fails before planning: set `ANTHROPIC_API_KEY` unless the request matches a template fast path.
- Input paths are rejected: if `IMAGE_GEN_INPUT_ROOT` is set, move input images under that directory or unset the variable.
- Output files are not where expected: set `IMAGE_GEN_OUTPUT_DIR` or pass `outputDir` / `outputPath` in the tool call.

## Next Steps

- Read [DEVELOPMENT.md](DEVELOPMENT.md) for local development commands and contribution workflow.
- Read [TESTING.md](TESTING.md) for the Vitest test suite and test organization.
- Read [CONFIGURATION.md](CONFIGURATION.md) for environment variables and MCP client configuration.
