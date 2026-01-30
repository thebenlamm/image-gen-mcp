# Testing Patterns

**Analysis Date:** 2026-01-29

## Test Framework

**Status:** Not detected

**Current State:**
- No test files in `src/` directory
- No test framework configured (jest, vitest, mocha not in devDependencies)
- No test scripts in package.json
- No test configuration files (jest.config.js, vitest.config.ts, etc.)

The codebase is currently **untested**. This is a critical gap for an MCP server handling multiple external API integrations.

## Testing Gaps & Recommendations

### Unit Tests Needed

**Provider Classes** (`src/providers/*.ts`):
- Each provider class needs unit tests for the `generate()` method
- Test each size mapping works correctly
- Test error cases:
  - Missing API key in constructor (should throw)
  - API response with missing image data (should throw)
  - Network errors
  - Invalid image format
- Mock external API calls using a mocking framework (e.g., vitest, jest)

**Utilities** (`src/utils/image.ts`):
- Test `expandTilde()` path expansion
- Test `slugify()` prompt slug generation (50 char limit, special characters)
- Test `generateFilename()` produces expected format: `{date}-{provider}-{slug}-{hash}.png`
- Test `getOutputDir()` creates directory if missing
- Test `saveImage()` writes buffer to correct location
- Mock filesystem calls

**Provider Registry** (`src/providers/index.ts`):
- Test `ProviderRegistry.register()` stores providers
- Test `ProviderRegistry.get()` retrieves registered providers
- Test `ProviderRegistry.getAvailable()` lists available providers
- Test `ProviderRegistry.has()` correctly checks provider existence

**MCP Server** (`src/index.ts`):
- Test `generate_image` tool parameter validation via Zod schema
- Test provider selection and routing
- Test error responses when provider unavailable
- Test success responses with image saved
- Mock provider implementations
- Mock file saving

### Integration Tests Needed

**Provider Integration:**
- Test OpenAI provider against real API (requires API key, integration test environment)
- Test Gemini provider against real API
- Test Replicate provider against real API (including image fetch)
- Test Together AI provider against real API
- Test Grok provider against real API
- Verify size mappings match actual API requirements

**End-to-End Flow:**
- Test complete flow: tool invocation → provider generate → file save → response
- Test error handling through entire pipeline
- Test with various prompt lengths and special characters

### Recommended Test Structure

```typescript
// File: src/providers/__tests__/openai.test.ts
describe('OpenAIProvider', () => {
  describe('constructor', () => {
    it('should throw if OPENAI_API_KEY not set', () => {
      // Setup: delete env var
      // Assert: expect(() => new OpenAIProvider()).toThrow()
    });
  });

  describe('generate()', () => {
    it('should return buffer with model name', async () => {
      // Mock: client.images.generate
      // Act: provider.generate({ prompt: '...' })
      // Assert: result.buffer is Buffer, result.model === 'gpt-image-1'
    });

    it('should throw if API returns no image data', async () => {
      // Mock: client.images.generate returns { data: [] }
      // Assert: expect(provider.generate(...)).rejects.toThrow()
    });

    it('should map size to correct dimension', async () => {
      // Test: landscape → 1792x1024
      // Test: portrait → 1024x1792
      // Test: square → 1024x1024
    });
  });
});

// File: src/utils/__tests__/image.test.ts
describe('image utilities', () => {
  describe('expandTilde()', () => {
    it('should expand ~/ to home directory', () => {
      // Act: expandTilde('~/test')
      // Assert: result.includes(os.homedir())
    });
  });

  describe('slugify()', () => {
    it('should lowercase and replace spaces with dashes', () => {
      // Act: slugify('Hello World')
      // Assert: equals 'hello-world'
    });

    it('should limit to 50 characters', () => {
      // Act: slugify('a'.repeat(100))
      // Assert: result.length === 50
    });

    it('should remove leading/trailing dashes', () => {
      // Act: slugify('-hello-')
      // Assert: equals 'hello'
    });
  });

  describe('generateFilename()', () => {
    it('should produce format: {date}-{provider}-{slug}-{hash}.png', () => {
      // Act: generateFilename('test prompt', 'openai')
      // Assert: matches /^\d{4}-\d{2}-\d{2}-openai-test-prompt-[a-f0-9]{6}\.png$/
    });
  });
});
```

## How Tests Should Run

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Recommended Test Framework: Vitest

**Why Vitest:**
- Native ES module support (project uses `"type": "module"`)
- Fast, built on Vite
- Jest-compatible API (familiar syntax)
- Good TypeScript support
- Works well with fetch mocking

**Setup steps:**
1. Add to devDependencies: `vitest`, `@vitest/ui`, `happy-dom` (for DOM mocking if needed)
2. Add to devDependencies: `msw` (Mock Service Worker for API mocking) or `node-mocks-http`
3. Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70,
    },
  },
});
```
4. Create `src/__tests__/setup.ts` for shared test utilities
5. Add npm scripts:
```json
{
  "test": "vitest",
  "test:watch": "vitest --watch",
  "test:coverage": "vitest --coverage"
}
```

## Mocking Strategy

**API Calls:**
- Use MSW (Mock Service Worker) to intercept fetch/HTTP calls
- Or use Jest/Vitest manual mocks for SDK clients

Example for OpenAI:
```typescript
vi.mock('openai', () => ({
  default: vi.fn(() => ({
    images: {
      generate: vi.fn()
    }
  }))
}));
```

**Filesystem:**
- Use vitest `vi.mock()` for fs module
- Or use `memfs` for in-memory filesystem

**Environment Variables:**
- Use `beforeEach()` to set/restore env vars
- Save original values, restore after each test

## Critical Testing Areas

These should be tested first (highest priority):

1. **Provider Error Handling** - Each provider must gracefully handle:
   - Missing API keys
   - API rate limits (429 responses)
   - Invalid API responses
   - Network timeouts

2. **Image File Saving** - Verify:
   - Files actually written to disk
   - Directory created if missing
   - Filenames are unique (hash prevents collisions)
   - Buffer corruption doesn't occur

3. **MCP Tool Invocation** - Test the public-facing tool:
   - Prompt parameter required
   - Provider selection works
   - Model parameter passed through
   - Size parameter converted to provider format
   - Error messages return structured JSON

4. **Registry Functionality** - Ensure:
   - Only configured providers registered
   - Requesting unavailable provider returns helpful error
   - getAvailable() never empty when at least one API key set

## Testing Against Real APIs

**Integration test environment:**
- Create `.env.test` file with test API keys
- Skip integration tests in CI unless explicitly enabled
- Tag integration tests separately: `@integration`
- Use minimal prompts to reduce API costs

Example:
```typescript
describe('OpenAI Integration', { skip: !process.env.OPENAI_API_KEY }, () => {
  it('should generate image from real API', async () => {
    // Only runs if OPENAI_API_KEY set
  });
});
```

---

*Testing analysis: 2026-01-29*
