<!-- generated-by: gsd-doc-writer -->
# Development

## Local Setup

Clone the repository, install dependencies, and build the TypeScript output:

```bash
git clone https://github.com/thebenlamm/image-gen-mcp.git
cd image-gen-mcp
npm install
npm run build
```

Set provider environment variables only for the providers or evals you need to exercise. Local sharp and OCR-related tests use fixtures and mocks where possible.

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Runs `tsc` and writes compiled output to `dist/`. |
| `npm run dev` | Runs `tsc --watch` for incremental TypeScript compilation. |
| `npm start` | Runs `node dist/index.js` to start the compiled MCP server over stdio. |
| `npm run check-models` | Runs `tsx scripts/check-models.ts` to report provider model availability. |
| `npm run eval` | Runs `tsx scripts/run-eval.ts` for the image capability eval harness. |
| `npm test` | Runs `vitest run`. |
| `npm run test:watch` | Runs interactive Vitest watch mode. |
| `npm run test:runs` | Runs only tests under `tests/runs`. |

The `postinstall` lifecycle script runs `npm run build` after dependency installation.

## Code Style

No ESLint, Prettier, Biome, or EditorConfig file is present in the repository. TypeScript strictness is enforced through `tsconfig.json`, which enables `strict`, `forceConsistentCasingInFileNames`, and declaration output. Use the existing TypeScript style: ES modules, explicit exported interfaces and types, and small modules grouped by runtime area.

## Branch Conventions

The current branch is `main`. No branch naming convention is documented in `.github` or repository configuration, and no contributing guide is present.

## PR Process

No pull request template or contributing guide is present. A practical PR should:

- Describe the MCP tool, provider, capability, or documentation behavior changed.
- Include tests for changed source behavior under the matching `tests/` area.
- Run `npm run build` and `npm test` before review.
- Update `README.md`, `CLAUDE.md`, `AGENTS.md`, and `.mcp.json` when tool schemas, providers, capabilities, or default MCP environment wiring change.
