# Codebase Concerns

**Analysis Date:** 2026-01-29

## Tech Debt

**Unvalidated External Fetch Requests:**
- Issue: Raw `fetch()` calls in `replicate.ts`, `together.ts`, and `grok.ts` lack request timeout handling, which can cause indefinite hanging if a remote server becomes unresponsive
- Files: `src/providers/replicate.ts` (line 42), `src/providers/together.ts` (line 26), `src/providers/grok.ts` (line 20)
- Impact: MCP server can hang waiting for unresponsive APIs, blocking other requests. Network timeouts can leave open connections consuming resources.
- Fix approach: Wrap fetch calls with AbortController and timeout handling (e.g., 30s timeout with explicit abort). Consider using a fetch library with built-in timeout support or create a utility wrapper function `fetchWithTimeout()` in `src/utils/fetch.ts`.

**Type-Safety Bypass with @ts-expect-error:**
- Issue: `src/providers/gemini.ts` line 35 suppresses TypeScript type checking for Imagen-specific config object (`responseModalities`, `aspectRatio`). This masks potential API compatibility issues.
- Files: `src/providers/gemini.ts` (line 35)
- Impact: Type changes in the Google SDK could silently break at runtime without TypeScript warnings. Makes refactoring risky.
- Fix approach: Create a proper TypeScript interface for Imagen generation config with all expected fields, then use type assertion with explanation rather than blanket `@ts-expect-error`.

**Provider Constructor Errors During Registry Init:**
- Issue: In `src/index.ts` lines 16-22, provider factory functions throw errors if API keys are missing, but these are caught and filtered as `null`. However, if a provider throws an error for ANY OTHER reason during construction, the entire server initialization fails.
- Files: `src/index.ts` (lines 16-22), all provider files (openai.ts, gemini.ts, replicate.ts, together.ts, grok.ts)
- Impact: A transient error during server startup (e.g., bad API key format, network issue) crashes the entire process. No graceful degradation.
- Fix approach: Wrap each provider factory in try-catch, log non-key-related errors, and continue registration. Only fail if zero providers successfully initialize.

## Performance Bottlenecks

**Synchronous File System Operations in Critical Path:**
- Issue: `src/utils/image.ts` line 27 uses `fs.mkdirSync()` (blocking) during directory initialization. If output directory is on network storage or experiencing I/O contention, it blocks the main event loop.
- Files: `src/utils/image.ts` (line 27)
- Impact: First-time image generation with missing output directory will hang the entire MCP process briefly. Under high concurrency, contention on writeFile (line 45) could queue requests.
- Fix approach: Use async `fs.promises.mkdir()` instead of sync version. Pre-create output directory at server startup in `main()` rather than lazily at first request.

**No Request Concurrency Limiting:**
- Issue: Multiple concurrent image generation requests share the same provider instances with no internal queuing or rate limiting. Provider APIs (OpenAI, Gemini, Together) have strict rate limits.
- Files: `src/providers/openai.ts`, `src/providers/gemini.ts`, `src/providers/together.ts`, `src/providers/grok.ts`
- Impact: If Claude requests 10 images in rapid succession, all 10 requests hit the API simultaneously, likely triggering rate limit 429 errors. Users get confusing "API error" responses instead of queued requests.
- Fix approach: Implement a queue-based semaphore for each provider. Use a library like `p-queue` or implement a simple async semaphore in `src/utils/queue.ts` that limits concurrent requests per provider to 1-3 depending on API tier.

**Base64 Decoding without Stream Processing:**
- Issue: `src/providers/together.ts` (line 53), `grok.ts` (line 45), and `openai.ts` (line 40) decode entire base64 responses into memory as single Buffer objects. For large images, this can cause spikes in heap usage.
- Files: `src/providers/together.ts` (line 53), `src/providers/grok.ts` (line 45), `src/providers/openai.ts` (line 40)
- Impact: Generating multiple large images concurrently could exceed available memory on resource-constrained systems. No handling for out-of-memory conditions.
- Fix approach: Investigate if providers can return binary data directly instead of base64. If not, consider streaming writes directly to file rather than buffering entire image in memory.

## Security Considerations

**API Keys Logged in Error Messages:**
- Issue: In `src/providers/together.ts` (line 44) and `grok.ts` (line 36), full API error responses are captured with `.text()` and returned. If the remote API echoes the API key in its error message, the key leaks to the MCP response and potentially to logs.
- Files: `src/providers/together.ts` (line 44), `src/providers/grok.ts` (line 36)
- Impact: API keys could be exposed in error logs, client responses, or audit trails if errors mention auth tokens.
- Fix approach: Never pass raw error text from external APIs to clients. Parse error responses, extract the status code and generic message (e.g., "Authentication failed"), log the raw response securely server-side, and return sanitized error to user.

**Hardcoded API Endpoints:**
- Issue: API endpoints are hardcoded in provider files: `https://api.together.xyz/v1/images/generations` (together.ts:26), `https://api.x.ai/v1/images/generations` (grok.ts:20). If endpoints change, requires code update and redeploy.
- Files: `src/providers/together.ts` (line 26), `src/providers/grok.ts` (line 20)
- Impact: No flexibility to switch endpoints (e.g., for proxy URLs, API versioning, or regional endpoints). Difficult to test against mock servers.
- Fix approach: Move endpoints to environment variables with sensible defaults: `TOGETHER_API_URL`, `XAI_API_URL`. Document in README and CLAUDE.md.

**Missing Input Validation:**
- Issue: `src/index.ts` line 41 accepts a `prompt` string of any length through the Zod schema without length limits. Similarly, `model` parameter (line 46) is unrestricted string.
- Files: `src/index.ts` (lines 41, 46)
- Impact: Excessively long prompts could consume memory or trigger API errors. Malformed model names (e.g., SQL injection attempts) are passed directly to API calls without validation.
- Fix approach: Add Zod constraints: `prompt: z.string().min(1).max(2000)`, `model: z.string().regex(/^[a-z0-9\-_\/\.]+$/i)` to enforce safe input boundaries.

## Fragile Areas

**Replicate Provider Tight Coupling to Output Format:**
- Issue: `src/providers/replicate.ts` line 35 assumes Replicate always returns array or URL string without validating the type. Different model runs could return different response structures.
- Files: `src/providers/replicate.ts` (line 35)
- Why fragile: If Replicate's API response format changes (e.g., returns object with `image_url` key instead of raw URL), parsing fails silently with "Unexpected response format" without helpful debugging info.
- Safe modification: Add detailed response logging when parse fails. Validate response shape matches expected model output schema before accessing fields. Provide escape hatch to override response parser per model.
- Test coverage: No tests for different Replicate response formats (array vs single URL, data URI vs HTTP URL).

**Gemini Provider Type Mismatch with SDK:**
- Issue: `src/providers/gemini.ts` lines 44-50 manually drill into nested response object (`candidate.content.parts[0].inlineData.data`). If Google's SDK structure changes, parsing breaks.
- Files: `src/providers/gemini.ts` (lines 44-50)
- Why fragile: The `@ts-expect-error` comment suggests the response structure is not fully typed. No defensive checks (e.g., `?.length > 0` guards).
- Safe modification: Extract response parsing to separate function with explicit checks at each level. Add logging for malformed responses. Validate image data is present before dereferencing.
- Test coverage: No unit tests for Gemini response parsing with mock responses.

**Error Handling Inconsistency Across Providers:**
- Issue: Different providers handle errors differently: some check `response.ok` (Together, Grok), some check for null data (OpenAI, Gemini). No unified error interface.
- Files: `src/providers/openai.ts`, `src/providers/gemini.ts`, `src/providers/together.ts`, `src/providers/grok.ts`, `src/providers/replicate.ts`
- Why fragile: Each provider can fail differently. New developers adding providers must remember all the edge cases. Client code can't distinguish between API errors, network errors, and missing data.
- Safe modification: Create a `ProviderError` class extending Error with fields: `code` (API_ERROR, NETWORK_ERROR, INVALID_RESPONSE), `retryable` (boolean), `originalError` (cause). Have each provider throw this instead of generic Error.
- Test coverage: No tests for error scenarios (missing API keys, API timeouts, malformed responses).

**Filename Generation Collision Risk:**
- Issue: `src/utils/image.ts` line 36 uses only 3 bytes of random hex (6 characters) for uniqueness. With many requests per day, collisions become likely.
- Files: `src/utils/image.ts` (line 36)
- Why fragile: If two images are generated with identical prompts on the same day, hash collision causes the second to overwrite the first. Users lose generated images silently.
- Safe modification: Use at least 6+ bytes of entropy (12+ hex chars). Consider using timestamp + counter instead of pure random for better distribution.
- Test coverage: No tests for filename uniqueness or collision behavior.

## Scaling Limits

**Single-Threaded Event Loop Shared Across All Providers:**
- Current capacity: Can handle ~5-10 concurrent image requests before hitting provider rate limits. Node.js event loop (single-threaded) processes all in sequence.
- Limit: As number of active MCP clients grows, any slow provider (e.g., OpenAI during high load) blocks the entire event loop.
- Scaling path:
  1. Add request queue per provider (see Performance Bottlenecks).
  2. Consider worker threads for CPU-intensive operations (if any future additions require it).
  3. Implement circuit breaker pattern to fail fast when provider APIs are degraded rather than timeout waiting.

**Output Directory Disk Space Unbounded:**
- Current capacity: Saves every generated image indefinitely to disk.
- Limit: If generating 100+ images daily, disk fills after ~2 months (assuming ~5MB per image).
- Scaling path: Implement output directory size quota, cleanup policies (e.g., delete images >30 days old), or S3 integration for remote storage.

## Dependencies at Risk

**Zod Schema Not Validated at Server Start:**
- Risk: Zod schema defines the tool, but if schema definition is incorrect (e.g., wrong enum values, missing required fields), error only appears when tool is called, not at startup.
- Files: `src/index.ts` (lines 37-51)
- Impact: Server starts successfully but first image request fails with confusing schema error.
- Migration plan: Add schema validation test at startup that simulates calling the tool with valid inputs. Fail fast if schema is broken.

**@google/generative-ai SDK Using @ts-expect-error:**
- Risk: SDK version mismatches or breaking API changes could cause runtime failures masked by `@ts-expect-error`.
- Files: `src/providers/gemini.ts` (line 35), package.json (version ^0.21.0)
- Impact: SDK updates could change response structure without TypeScript catching it.
- Migration plan: Pin SDK to exact version until proper type support for Imagen is available. Add integration tests against real API to catch breakage.

## Missing Critical Features

**No Retry Logic:**
- Problem: Transient network errors, API timeouts, or rate limits cause immediate failure with no retry attempts.
- Blocks: Users can't reliably generate images during API provider outages. Every failed request costs quota/credits.
- Recommendation: Implement exponential backoff retry with jitter for transient errors (5xx, timeout, rate limit 429). Use [p-retry](https://github.com/sindresorhus/p-retry) or build custom with max 3 retries over 30 seconds.

**No Progress Indication for Long Operations:**
- Problem: Image generation can take 10-30 seconds. No way to report progress to Claude.
- Blocks: Claude has no feedback that request is processing. Users don't know if server is stuck or legitimately generating.
- Recommendation: Use MCP's resource progress reporting (if supported) or return partial status updates. Document expected generation time per provider.

**No API Cost Estimation:**
- Problem: Users don't know how much a request costs before executing. Some providers are 10-100x more expensive than others.
- Blocks: Users can't make informed decisions about which provider to use.
- Recommendation: Add cost fields to provider info. Return estimated cost in response metadata.

## Test Coverage Gaps

**No Unit Tests for Provider Response Parsing:**
- What's not tested: How each provider handles malformed API responses (missing fields, wrong types, empty arrays).
- Files: `src/providers/openai.ts`, `src/providers/gemini.ts`, `src/providers/replicate.ts`, `src/providers/together.ts`, `src/providers/grok.ts`
- Risk: Silent failures when APIs change response format. No confidence when upgrading SDKs.
- Priority: HIGH - Response parsing is the most fragile cross-provider logic.

**No Integration Tests:**
- What's not tested: End-to-end image generation with real API keys. Error scenarios (invalid prompts, rate limits, API downtime).
- Files: Entire `src/` directory
- Risk: Bugs in provider code only discovered by users. Can't verify providers still work after SDK upgrades.
- Priority: HIGH - Especially for Gemini (@ts-expect-error) and Replicate (variable response format).

**No Error Handling Tests:**
- What's not tested: Server behavior when output directory is unwritable, disk is full, API key is invalid, or network is unreachable.
- Files: `src/utils/image.ts`, all provider files
- Risk: Unknown failure modes in production. Users get uninformative error messages.
- Priority: MEDIUM - Important for supportability but less critical than response parsing.

**No Concurrency Tests:**
- What's not tested: Multiple simultaneous requests to same provider. Race conditions when writing files with same name. Provider rate limit handling.
- Files: `src/index.ts`, `src/providers/*`, `src/utils/image.ts`
- Risk: Unpredictable failures under real-world usage patterns where users make multiple requests.
- Priority: MEDIUM - Depends on whether concurrent requests are expected usage pattern.

---

*Concerns audit: 2026-01-29*
