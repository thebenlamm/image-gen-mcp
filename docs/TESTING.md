<!-- generated-by: gsd-doc-writer -->
# Testing

## Test Framework and Setup

The project uses Vitest. `package.json` lists `vitest` in `devDependencies`, and `vitest.config.ts` configures:

- `environment: 'node'`
- `include: ['tests/**/*.test.ts']`
- `fileParallelism: false`
- `testTimeout: 10_000`

Install dependencies before running tests:

```bash
npm install
```

## Running Tests

Run the full suite:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Run only run-artifact tests:

```bash
npm run test:runs
```

Run a single test file with Vitest:

```bash
npx vitest run tests/task/plan-validator.test.ts
```

## Writing New Tests

Test files use the `*.test.ts` naming convention under `tests/`. The directory layout mirrors the source areas:

| Test directory | Covers |
|----------------|--------|
| `tests/capabilities/` | Individual capability implementations and capability registry behavior. |
| `tests/integration/` | MCP tool flows for `image_op`, `image_task`, and `list_capabilities`. |
| `tests/task/` | Planning, validation, DAG execution, reference resolution, serialization, and templates. |
| `tests/runs/` | Run IDs, artifact directories, manifests, writes, and retention. |
| `tests/utils/` | Shared utilities such as OCR and input-root handling. |
| `tests/eval/` | Evaluation fixtures, scoring, results, and eval runner behavior. |

Shared helpers live in `tests/helpers/`, including `tests/helpers/tmpOutputDir.ts` for temporary output directory setup.

## Coverage Requirements

No coverage threshold is configured in `vitest.config.ts`, `package.json`, or a separate coverage config file.

| Type | Threshold |
|------|-----------|
| Lines | Not configured |
| Branches | Not configured |
| Functions | Not configured |
| Statements | Not configured |

## CI Integration

No `.github/workflows/` directory is present in the repository, so no CI test workflow is checked in.
