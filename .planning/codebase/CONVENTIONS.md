# Coding Conventions

**Analysis Date:** 2026-01-29

## Naming Patterns

**Files:**
- PascalCase for provider classes: `openai.ts`, `gemini.ts`, `replicate.ts` (implement functionality)
- camelCase for utilities and modules: `image.ts` (helper functions)
- `index.ts` for barrel exports and type definitions
- Factory functions prefixed with `create`: `createOpenAIProvider()`, `createGeminiProvider()`

**Functions:**
- camelCase for all functions: `generateFilename()`, `saveImage()`, `expandTilde()`, `slugify()`
- Factory functions return `Type | null` to signal optional initialization
- Async functions use `async/await` pattern, no Promise-based chaining

**Variables:**
- camelCase for local variables and parameters
- SCREAMING_SNAKE_CASE for module-level constants: `SIZE_MAP`, `ASPECT_RATIO_MAP`
- `const` by default, `let` only when reassignment required (rare)
- Defensive variable naming in error handling: `const message = error instanceof Error ? error.message : String(error);`

**Types:**
- PascalCase for all interfaces: `ImageProvider`, `GenerateParams`, `GenerateResult`, `ImageSize`
- Type exports at top of modules
- Discriminated type unions via enum strings: `type ProviderName = 'openai' | 'gemini' | 'replicate' | 'together' | 'grok';`
- Const assertion for literal types: `name = 'openai' as const;`

## Code Style

**Formatting:**
- TypeScript with strict mode enabled (`"strict": true` in tsconfig.json)
- Line breaks after function signatures
- Object literals on multiple lines when >2 properties
- Imports grouped: SDK/libraries first, then project imports (no explicit sorting)

**Linting:**
- No ESLint config in use (none detected in project root)
- TypeScript compiler provides primary type checking
- Target: ES2022, moduleResolution: NodeNext

**Import Organization:**
- SDK/external library imports first: `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';`
- Type imports on same line as value imports (not separated): `import type { ImageProvider, GenerateParams } from './index.js';`
- Relative imports use `./` notation with `.js` extensions (ESM compatibility): `import { createOpenAIProvider } from './providers/openai.js';`
- All relative paths include `.js` extension for Node.js ES module support

**Path Aliases:**
- No path aliases configured in tsconfig.json
- Imports use relative paths only

## Error Handling

**Patterns:**
- Constructor validation with early throws: `if (!apiKey) { throw new Error('OPENAI_API_KEY environment variable is required'); }`
- Try-catch blocks wrap async API calls at the tool level (`src/index.ts`)
- Error message extraction using type narrowing: `const message = error instanceof Error ? error.message : String(error);`
- Defensive deep property access: `imageData?.b64_json`, `data.data?.[0]?.b64_json`
- Optional chaining for nested object inspection: `const candidate = result.candidates?.[0];`
- Non-null assertion only after explicit checks: `if (!imageData?.b64_json) { throw new Error(...); }`
- Response validation before buffer conversion: Check `!response.ok` before reading body

## Logging

**Framework:** `console.error()` for startup/diagnostic output

**Patterns:**
- Error logging only at application startup (main function): `console.error('No image providers configured...')`
- Provider initialization logs at startup: `console.error('Available providers: ...')`
- No logging in provider generate() methods or utilities (errors handled via exceptions)
- Errors bubbled up to MCP tool handler for consistent response formatting

## Comments

**When to Comment:**
- Comments used only for non-obvious implementation details
- Example: `// Use the Imagen model for image generation` (clarifies which model variant)
- Example: `// Replicate returns a URL or array of URLs` (explains API quirk)
- Example: `// xAI uses OpenAI-compatible API format` (explains API compatibility)

**JSDoc/TSDoc:**
- Not used (interfaces and functions are self-documenting via types)
- Tool descriptions provided via Zod schema: `.describe('Generate an image from a text prompt...')`

## Function Design

**Size:**
- Small focused functions (10-50 lines typical)
- `generate()` methods 20-40 lines
- Helper functions 5-20 lines

**Parameters:**
- Receive interface objects over multiple parameters: `params: GenerateParams` unpacks to `{ prompt, model, size }`
- Provider factories take no parameters (read from environment)

**Return Values:**
- Explicit return types: `Promise<GenerateResult>`, `string`, `ImageProvider | null`
- Early returns for error cases
- Last line returns result value (no intermediate result variables unless needed)

## Module Design

**Exports:**
- Type exports precede class/function exports: `export type ImageSize = ...` before `export interface ImageProvider`
- Singleton registry exported as singleton instance: `export const registry = new ProviderRegistry();`
- Factory functions exported individually: `export function createOpenAIProvider(): ImageProvider | null`
- No default exports; all named exports

**Barrel Files:**
- `src/providers/index.ts` exports types and registry
- `src/index.ts` is MCP server entry point (no re-exports)
- `src/utils/image.ts` exports utility functions directly

## Class Design

**Pattern:**
- Providers implement `ImageProvider` interface: `export class OpenAIProvider implements ImageProvider`
- Private fields for client instances: `private client: OpenAI;`
- Readonly name property with const assertion: `name = 'openai' as const;`
- Readonly defaultModel property: `defaultModel = 'gpt-image-1';`
- No getters/setters (properties exposed directly)
- Single public method `generate()`, constructor for initialization

## API Response Handling

**Pattern (consistent across all providers):**
```typescript
// 1. Call provider API with typed parameters
const response = await this.client.images.generate({ ... });

// 2. Extract data with optional chaining
const imageData = response.data?.[0];

// 3. Validate presence before accessing
if (!imageData?.b64_json) {
  throw new Error('No image data returned from OpenAI');
}

// 4. Convert to Buffer and return standardized result
const buffer = Buffer.from(imageData.b64_json, 'base64');
return { buffer, model, revisedPrompt };
```

## Environment Variable Access

**Pattern:**
- Read at construction time: `const apiKey = process.env.OPENAI_API_KEY;`
- Validate immediately with throws: `if (!apiKey) { throw new Error(...); }`
- Store as instance variable if needed: `this.apiKey = apiKey;`
- Never access environment variables in generate() methods (already validated)

## Type Safety

**Patterns:**
- Explicit type assertions only when necessary: `response_format: 'b64_json' as const`
- Generic model typing: `model as 'model/name'` for Replicate versioning
- @ts-expect-error annotations for SDK quirks: `// @ts-expect-error - Imagen-specific config`
- Record types for size mappings: `Record<ImageSize, string>` (provides exhaustiveness checking)

---

*Convention analysis: 2026-01-29*
