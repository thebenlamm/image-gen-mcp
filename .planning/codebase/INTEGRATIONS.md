# External Integrations

**Analysis Date:** 2026-01-29

## APIs & External Services

**Image Generation Providers:**

1. **OpenAI DALL-E**
   - What it's used for: Primary image generation via gpt-image-1, dall-e-3, dall-e-2 models
   - SDK/Client: openai 4.0.0
   - Auth: `OPENAI_API_KEY` environment variable
   - Implementation: `src/providers/openai.ts` - `OpenAIProvider` class
   - API endpoint: OpenAI SDK (internally routes to api.openai.com)
   - Capabilities: Size presets (1024x1024, 1792x1024, 1024x1792), revised prompt support, base64 image response

2. **Google Gemini Imagen**
   - What it's used for: Fast image generation via gemini-2.5-flash-image (default), gemini-3-pro-image-preview
   - SDK/Client: @google/generative-ai 0.21.0
   - Auth: `GEMINI_API_KEY` environment variable
   - Implementation: `src/providers/gemini.ts` - `GeminiProvider` class
   - API endpoint: generativelanguage.googleapis.com (via SDK)
   - Capabilities: Aspect ratio mapping (1:1, 16:9, 9:16), generationConfig for modalities, base64 response
   - Notes: Uses @ts-expect-error for Imagen-specific responseModalities config

3. **Replicate Model Platform**
   - What it's used for: Model variety (FLUX, Stable Diffusion, others) via user-specified models
   - SDK/Client: replicate 1.0.0
   - Auth: `REPLICATE_API_TOKEN` environment variable
   - Implementation: `src/providers/replicate.ts` - `ReplicateProvider` class
   - API endpoint: api.replicate.com (via SDK)
   - Default model: black-forest-labs/flux-1.1-pro
   - Capabilities: Aspect ratio (1:1, 16:9, 9:16), returns URLs requiring secondary fetch
   - Flow: Run model → receive URL → fetch image binary → buffer

4. **Together AI FLUX**
   - What it's used for: Fast/affordable image generation
   - SDK/Client: Direct HTTP fetch (no npm package)
   - Auth: `TOGETHER_API_KEY` bearer token
   - Implementation: `src/providers/together.ts` - `TogetherProvider` class
   - API endpoint: https://api.together.xyz/v1/images/generations
   - Default model: black-forest-labs/FLUX.1-schnell
   - Request format: JSON POST, OpenAI-compatible schema (model, prompt, width, height, n, response_format)
   - Response: { data: [{ b64_json: string }] }

5. **xAI Grok Aurora**
   - What it's used for: Aurora image generation model
   - SDK/Client: Direct HTTP fetch (no npm package)
   - Auth: `XAI_API_KEY` bearer token
   - Implementation: `src/providers/grok.ts` - `GrokProvider` class
   - API endpoint: https://api.x.ai/v1/images/generations
   - Default model: grok-2-image
   - Request format: JSON POST, OpenAI-compatible schema (model, prompt, n, response_format)
   - Response: { data: [{ b64_json: string }] }

## Data Storage

**Databases:**
- None - Stateless service

**File Storage:**
- Local filesystem only
  - Output: `~/.planning/codebase/image.ts` - `getOutputDir()`, `saveImage()`
  - Default directory: `~/Downloads/generated-images`
  - Configurable via: `IMAGE_GEN_OUTPUT_DIR` environment variable
  - Behavior: Auto-creates directory if missing (recursive mkdir)
  - File naming: `{date}-{provider}-{prompt-slug}-{hash}.png`

**Caching:**
- None

## Authentication & Identity

**Auth Providers:**
- Custom (API key-based)
  - Implementation: Environment variable injection, per-provider
  - Pattern: `process.env.{PROVIDER_API_KEY}`
  - Validation: Factory functions return null if key missing (graceful degradation)
  - Security: No inline defaults, missing keys disable provider silently

## Monitoring & Observability

**Error Tracking:**
- None

**Logs:**
- console.error() only
  - `src/index.ts` - Server startup diagnostics
  - Outputs to stderr: available provider list, default provider, startup errors

## CI/CD & Deployment

**Hosting:**
- Not applicable (MCP server, client-hosted)
- Execution: Node.js process started by MCP client (Claude Code, Claude Desktop)
- Configuration: via MCP config file (Claude settings or claude_desktop_config.json)

**CI Pipeline:**
- None detected

## Environment Configuration

**Required env vars (at least one):**
- `OPENAI_API_KEY` - OpenAI authentication
- `GEMINI_API_KEY` - Google AI authentication
- `REPLICATE_API_TOKEN` - Replicate authentication
- `TOGETHER_API_KEY` - Together AI authentication
- `XAI_API_KEY` - xAI authentication

**Optional env vars:**
- `IMAGE_GEN_DEFAULT_PROVIDER` - Default provider (openai, gemini, replicate, together, grok)
- `IMAGE_GEN_OUTPUT_DIR` - Image save directory (supports ~/tilde expansion)

**Secrets location:**
- Environment variables only (no .env file support, no config files)
- MCP configuration: passed via client settings (Claude Code/Desktop config JSON)
- Alternative: shell environment at runtime

## Webhooks & Callbacks

**Incoming:**
- None (stateless server, no persistent endpoints)

**Outgoing:**
- None

## Network Access

**Outbound dependencies:**
1. api.openai.com - OpenAI DALL-E generation
2. generativelanguage.googleapis.com - Google Gemini Imagen generation
3. api.replicate.com - Replicate model platform
4. api.together.xyz - Together AI image API
5. api.x.ai - xAI Grok image API
6. *.replicate.asset.sharedby.ai (URL returns) - Image fetch from Replicate outputs
7. Generic HTTPS for any model URL returns (fetch() in providers)

## Provider Registry Pattern

- Location: `src/providers/index.ts`
- Pattern: ProviderRegistry (Map-based)
- Interface: `ImageProvider` {name, defaultModel, generate()}
- Registration: Factory pattern with null check (graceful missing keys)
- Lookup: registry.get(name), registry.getAvailable()
- Tool routing: Single `generate_image` tool delegates to registry

---

*Integration audit: 2026-01-29*
