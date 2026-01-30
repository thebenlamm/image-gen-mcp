# Codebase Structure

**Analysis Date:** 2026-01-29

## Directory Layout

```
image-gen-mcp/
├── src/                           # TypeScript source
│   ├── index.ts                   # MCP server entry point
│   ├── providers/
│   │   ├── index.ts               # Provider interface & registry
│   │   ├── openai.ts              # OpenAI/DALL-E implementation
│   │   ├── gemini.ts              # Google Gemini/Imagen implementation
│   │   ├── replicate.ts           # Replicate (FLUX, Stable Diffusion)
│   │   ├── together.ts            # Together AI (FLUX)
│   │   └── grok.ts                # xAI Grok image generation
│   └── utils/
│       └── image.ts               # Image file I/O and naming
├── dist/                          # Compiled JavaScript (generated)
├── docs/                          # Documentation
│   ├── DESIGN.md                  # Design decisions and rationale
│   └── plans/                     # Project planning documents
├── .planning/
│   └── codebase/                  # GSD codebase documentation
├── tsconfig.json                  # TypeScript configuration
├── package.json                   # Dependencies and scripts
└── README.md                      # Project documentation
```

## Directory Purposes

**src/:**
- Purpose: All TypeScript application code
- Contains: MCP server implementation, provider adapters, utilities
- Key files: `index.ts` (entry point)

**src/providers/:**
- Purpose: Provider-specific image generation implementations
- Contains: Five provider adapters (OpenAI, Gemini, Replicate, Together, Grok) plus registry
- Key files: `index.ts` (ImageProvider interface and ProviderRegistry), one file per provider

**src/utils/:**
- Purpose: Shared utility functions for image handling
- Contains: File saving, output directory management, filename generation
- Key files: `image.ts` (single utility module)

**dist/:**
- Purpose: Compiled JavaScript and type declarations
- Contains: Output from TypeScript compiler
- Generated: Yes (via `npm run build`)
- Committed: No

**docs/:**
- Purpose: Project documentation and design rationale
- Contains: DESIGN.md and planning documents
- Key files: `DESIGN.md`

**.planning/codebase/:**
- Purpose: GSD (Grand Strategic Design) documentation
- Contains: Codebase analysis (ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, STACK.md, INTEGRATIONS.md, CONCERNS.md)
- Generated: Yes (by GSD analysis tools)
- Committed: Yes

## Key File Locations

**Entry Points:**
- `src/index.ts`: MCP server initialization, tool handler, provider registration

**Configuration:**
- `tsconfig.json`: TypeScript compiler options
- `package.json`: Dependencies, build scripts, metadata
- Environment variables read from process.env in provider constructors

**Core Logic:**
- `src/providers/index.ts`: ImageProvider interface definition and ProviderRegistry implementation
- `src/providers/{openai,gemini,replicate,together,grok}.ts`: Provider-specific implementations
- `src/utils/image.ts`: Image file operations

**Type Definitions:**
- `src/providers/index.ts`: TypeScript interfaces (ImageProvider, GenerateParams, GenerateResult, ImageSize)

## Naming Conventions

**Files:**
- Provider files: `{provider-name}.ts` (lowercase, kebab-case if multi-word)
- Utilities: descriptive noun (e.g., `image.ts`)
- Index files: `index.ts` for module re-exports and registry
- Example: `src/providers/openai.ts`, `src/utils/image.ts`

**Directories:**
- Functional grouping: `providers/`, `utils/`
- Lowercase, plural when containing multiple items
- Example: `src/providers/`, `src/utils/`

**Classes:**
- PascalCase with descriptive name: `OpenAIProvider`, `GeminiProvider`, `ProviderRegistry`
- Pattern: `{ServiceName}Provider` for provider implementations

**Functions:**
- camelCase: `createOpenAIProvider()`, `generateFilename()`, `saveImage()`, `getOutputDir()`
- Factory functions: `create{ProviderName}Provider()` pattern

**Types/Interfaces:**
- PascalCase: `ImageProvider`, `GenerateParams`, `GenerateResult`, `ImageSize`, `ProviderName`, `ProviderRegistry`
- Suffix conventions: Provider types are `{Name}Provider`, parameter types end in `Params`, result types end in `Result`

**Constants:**
- SCREAMING_SNAKE_CASE for module-level constants: `SIZE_MAP`, `ASPECT_RATIO_MAP`, `DEFAULT_PROVIDER`
- Logical grouping: provider-specific maps colocated near where used

## Where to Add New Code

**New Provider:**
1. Create file: `src/providers/{new-name}.ts`
2. Implement class: `export class {PascalCase}Provider implements ImageProvider`
3. Export factory: `export function create{PascalCase}Provider(): ImageProvider | null`
4. Import in: `src/index.ts` (add import, add to providers array, add to tool enum)
5. Environment variable: Document in CLAUDE.md, used in constructor

**New Utility Function:**
- Location: `src/utils/image.ts` (if image-related) or create new module
- Pattern: Export named function, use in caller
- Avoid: Creating unnecessary utility files; colocate with related code

**New Feature/Behavior:**
- Evaluate whether it's provider-specific or cross-cutting
- Provider-specific: Modify provider implementation
- Cross-cutting: Add to `src/index.ts` or create new utility module

**Tests (when added):**
- Colocate with source: `src/index.test.ts`, `src/providers/openai.test.ts`
- Or: Create `tests/` directory at root matching `src/` structure
- Test configuration: Add to tsconfig or create separate tsconfig.test.json

## Special Directories

**dist/:**
- Purpose: Compiled JavaScript output
- Generated: Yes (via `npm run build`)
- Committed: No (in .gitignore)
- Build command: `npm run build` (runs `tsc`)

**node_modules/:**
- Purpose: Installed dependencies
- Generated: Yes (via `npm install`)
- Committed: No
- Lock file: `package-lock.json` (committed)

**.planning/codebase/:**
- Purpose: GSD analysis and documentation
- Generated: By `/gsd:map-codebase` command
- Committed: Yes (version control for architectural decisions)
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, STACK.md, INTEGRATIONS.md, CONCERNS.md

**.claude/ and .claude-plugin/:**
- Purpose: Claude Code configuration and settings
- Generated: By Claude Code plugin
- Committed: Yes (project-specific settings)

---

*Structure analysis: 2026-01-29*
