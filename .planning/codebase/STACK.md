# Technology Stack

**Analysis Date:** 2026-01-29

## Languages

**Primary:**
- TypeScript 5.7.0 - Entire codebase, compiled to ES2022 JavaScript

**Secondary:**
- JavaScript (ES2022) - Runtime target, Node.js execution

## Runtime

**Environment:**
- Node.js (version unspecified, typically 18+)

**Package Manager:**
- npm 10.x (inferred from package-lock.json)
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- @modelcontextprotocol/sdk 1.0.0 - MCP server protocol, stdio transport, tool registration

**Build/Dev:**
- TypeScript 5.7.0 - Compilation (tsc), strict mode enabled
- Node.js native APIs - fs, path, os, crypto (built-in)

## Key Dependencies

**Critical:**
- @modelcontextprotocol/sdk 1.0.0 - MCP server framework, required for tool exposure
- openai 4.0.0 - OpenAI image generation API client
- @google/generative-ai 0.21.0 - Google Gemini API client
- replicate 1.0.0 - Replicate model platform API client
- zod 3.25.76 - Schema validation for tool parameters

**Infrastructure:**
- No database client - Stateless operation
- No auth library - API key based (env vars)
- No logging framework - console.error() for diagnostics

## Configuration

**Environment:**
- API keys via environment variables (required, one minimum):
  - `OPENAI_API_KEY` - OpenAI authentication
  - `GEMINI_API_KEY` - Google AI authentication
  - `REPLICATE_API_TOKEN` - Replicate authentication
  - `TOGETHER_API_KEY` - Together AI authentication
  - `XAI_API_KEY` - xAI Grok authentication

- Optional configuration:
  - `IMAGE_GEN_DEFAULT_PROVIDER` - Default provider selection (default: `openai`)
  - `IMAGE_GEN_OUTPUT_DIR` - Image save location (default: `~/Downloads/generated-images`)

**Build:**
- `tsconfig.json` - Compiler options, ES2022 target, strict null checking, ESM module resolution
- No build step beyond TypeScript compilation
- Output: `dist/index.js` (compiled entry point)

## Platform Requirements

**Development:**
- Node.js 18+
- npm or yarn
- TypeScript compiler (via npm)
- ~130MB node_modules (126 dependencies including transitive)

**Production:**
- Node.js 18+ (ES2022 support required)
- MCP-compatible client (Claude Code, Claude Desktop, or custom MCP client)
- File system write access for image output directory
- Network access to: api.openai.com, generativelanguage.googleapis.com, api.replicate.com, api.together.xyz, api.x.ai
- At least one API key configured for a supported provider

## Script Commands

```bash
npm run build        # Compile TypeScript (tsc)
npm run dev          # Watch mode compilation (tsc --watch)
npm run start        # Execute compiled server (node dist/index.js)
```

## Code Structure Compilation

- Source: `src/**/*.ts` (7 TypeScript files)
- Compiled: `dist/**/*.js` + declaration files
- Entrypoint: `dist/index.js` (from `src/index.ts`)
- Module system: ES Modules (type: "module" in package.json)

---

*Stack analysis: 2026-01-29*
