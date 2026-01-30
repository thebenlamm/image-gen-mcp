# Architecture

**Analysis Date:** 2026-01-29

## Pattern Overview

**Overall:** Provider Registry + Strategy Pattern

The codebase implements a multi-provider adapter architecture where a unified MCP tool delegates image generation requests to provider-specific implementations. A registry manages provider availability and routing.

**Key Characteristics:**
- Single MCP tool (`generate_image`) routes to multiple independent providers
- Each provider implements a standardized interface (`ImageProvider`)
- Providers self-register at startup if their API key is present
- Image size parameters are normalized across providers despite different naming conventions
- Error handling is provider-agnostic with graceful degradation for missing keys

## Layers

**MCP Server Layer:**
- Purpose: Exposes unified image generation capability to Claude via Model Context Protocol
- Location: `src/index.ts`
- Contains: Server initialization, tool schema definition, request routing, error response formatting
- Depends on: Provider registry, image utility functions
- Used by: Claude Code through MCP protocol

**Provider Layer:**
- Purpose: Adapter implementations for each image generation service
- Location: `src/providers/`
- Contains: OpenAI, Gemini, Replicate, Together AI, and Grok provider implementations
- Depends on: Provider-specific SDKs and HTTP clients
- Used by: MCP server for request fulfillment

**Utility Layer:**
- Purpose: Image persistence and filename generation
- Location: `src/utils/image.ts`
- Contains: Image file saving, filename formatting, directory management
- Depends on: File system and crypto modules
- Used by: MCP server layer after image generation

## Data Flow

**Request to Image Response:**

1. MCP client sends `generate_image` tool request with prompt, optional provider, model, and size
2. MCP server validates provider availability via registry
3. Server calls `imageProvider.generate(params)` with normalized parameters
4. Provider translates size enum to provider-specific format (e.g., `portrait` → `9:16` for Gemini, `960x1440` for Together)
5. Provider makes API call to external service with API key from environment
6. Provider receives raw image data and converts to Node.js Buffer
7. Server calls `saveImage(buffer, filename)` to write to output directory
8. Server returns success response with file path, provider, model, and optional revised prompt
9. On error: Server catches exception and returns error response with provider context

**State Management:**
- Provider registry is immutable singleton populated at startup
- No persistent state between requests
- API keys are environment-injected, never stored
- Generated files persisted to filesystem per `IMAGE_GEN_OUTPUT_DIR` config

## Key Abstractions

**ImageProvider Interface:**
- Purpose: Standardizes generation API across different providers
- Examples: `src/providers/openai.ts`, `src/providers/gemini.ts`, `src/providers/replicate.ts`, `src/providers/together.ts`, `src/providers/grok.ts`
- Pattern: Each implements synchronous constructor (throws if key missing) and async `generate()` method returning `GenerateResult` with Buffer

**Provider Registry:**
- Purpose: Maps provider name to implementation, handles availability queries
- Examples: Used in `src/index.ts` lines 16-26 for initialization, lines 54-68 for lookup
- Pattern: Simple Map-based registry with `register()`, `get()`, `getAvailable()`, and `has()` methods

**Provider Factory Functions:**
- Purpose: Graceful degradation - returns `null` if API key missing
- Examples: `createOpenAIProvider()`, `createGeminiProvider()`, etc.
- Pattern: Check environment variable, return provider instance or null, called at startup and filtered

**Size Normalization:**
- Purpose: Abstract away provider-specific size parameter formats
- Examples: SIZE_MAP in `openai.ts` (pixels), ASPECT_RATIO_MAP in `gemini.ts` and `replicate.ts` (ratios)
- Pattern: Enum-based mapping from abstract `ImageSize` ('square'|'landscape'|'portrait') to provider format

## Entry Points

**Main Server Process:**
- Location: `src/index.ts` lines 114-134 (`main()` function)
- Triggers: `npm start` or direct Node.js invocation
- Responsibilities: Initialize providers, validate at least one API key is present, start MCP server on stdio transport

**MCP Tool Handler:**
- Location: `src/index.ts` lines 37-111 (tool definition and handler)
- Triggers: Claude Code makes `generate_image` tool request
- Responsibilities: Validate provider availability, call provider, save image, format response

**Provider Initialization:**
- Location: `src/index.ts` lines 16-26 (provider array and filter)
- Triggers: Application startup
- Responsibilities: Instantiate all providers, filter out those with missing keys, register successful instances

## Error Handling

**Strategy:** Try-catch in tool handler with provider-aware error formatting

**Patterns:**
- Missing API keys: Prevented by factory functions returning null, which skips registration
- Unavailable provider requested: Error response lists available providers
- Provider API failure: Exception caught, error message returned with provider context
- Missing image data: Provider-specific validation throws descriptive error ("No image data returned from X")
- Network failures: Provider's fetch/API client throws, caught by tool handler
- File system errors: `saveImage()` may throw if directory creation fails (not explicitly caught, bubbles to tool handler)

## Cross-Cutting Concerns

**Logging:** Console.error for startup information and fatal errors (lines 118-125). Request-level logging delegated to MCP transport layer.

**Validation:**
- Tool schema uses Zod (provider enum, optional fields) at tool definition
- Provider constructors validate API key presence
- Providers validate response structure before processing

**Authentication:**
- Environment variable injection only
- Each provider responsible for API key management
- No shared auth logic - each provider uses its SDK's auth mechanism

**Size Handling:**
- Unified enum interface masks provider differences
- Providers define their own SIZE_MAP or ASPECT_RATIO_MAP
- Default is 'square' if not specified

---

*Architecture analysis: 2026-01-29*
