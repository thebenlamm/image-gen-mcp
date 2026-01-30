# Adversarial Review Prompts

Three standalone prompts for adversarial code review of Phases 1–3 of the Image-Gen MCP project. Each prompt is self-contained — copy-paste into a fresh LLM session with access to the codebase.

---

## Phase 1: Core Enhancements

```
You are performing an adversarial code review. Your job is to find bugs, security
vulnerabilities, edge cases, race conditions, and design flaws. Be skeptical. Assume
the code has problems until proven otherwise. Do not praise the code — only report issues.

## Project Context

This is an MCP (Model Context Protocol) server that provides multi-provider image
generation (OpenAI, Gemini, Replicate, Together AI, xAI Grok). It runs as a local
tool consumed by Claude Code. Phase 1 added:
- Output path control (outputPath, outputDir parameters)
- Default provider change from OpenAI to Grok (xAI)
- Style modifier parameter for prompt modification
- Size-aware provider selection (auto-selects size-capable provider when needed)
- Startup logging with provider availability

## Requirements Implemented

- CORE-01: User can specify exact output file path via `outputPath` parameter
- CORE-02: User can specify output directory via `outputDir` parameter (auto-generates filename)
- CORE-03: Default provider changes from openai to grok
- CORE-07: User can pass `style` parameter that modifies generation prompt
- CORE-08: Startup logs show available providers, default provider, and size-capable providers

## Files to Review

Read these files in full before beginning your review:

- `src/utils/image.ts` — Path resolution (expandTilde, slugify, resolveOutputPath, saveImage)
- `src/providers/index.ts` — Provider interface (ImageProvider, ProviderRegistry, GenerateParams)
- `src/index.ts` — MCP server entry point, generate_image tool (lines 41–137), startup (lines 334–352)
- `src/providers/openai.ts` — OpenAI provider (SIZE_MAP, images.generate call)
- `src/providers/gemini.ts` — Gemini provider (ASPECT_RATIO_MAP, generateContent call)
- `src/providers/grok.ts` — Grok provider (fetch-based, supportsSize=false)
- `src/providers/replicate.ts` — Replicate provider (URL-based output, fetch to get buffer)
- `src/providers/together.ts` — Together provider (width/height pixel sizes)

## Review Dimensions

Evaluate EACH of these dimensions. Read the relevant code, then report findings:

1. **Path Traversal / Security**: Can the outputPath or outputDir parameters be abused?
   Think about `../`, absolute paths, symlinks, null bytes, special characters. Can a
   malicious MCP client write to arbitrary locations?
   Focus: `src/utils/image.ts` resolveOutputPath (lines 47–88), expandTilde (lines 6–11)

2. **Race Conditions**: Are there TOCTOU (time-of-check-time-of-use) issues in path
   resolution? Can concurrent calls overwrite each other's files?
   Focus: `src/utils/image.ts` mkdir + writeFile sequence

3. **Error Handling Gaps**: What happens when API calls fail mid-stream? Are Buffers
   cleaned up? Can partial files be left on disk? What happens if mkdir fails?
   Focus: `src/index.ts` generate_image handler (lines 59–136), `src/utils/image.ts` saveImage

4. **Input Validation**: Is the outputPath `.png` check sufficient? What about `.png.exe`?
   Are prompts sanitized before being used in filenames? Can the slugify function produce
   collisions or empty strings?
   Focus: `src/utils/image.ts` slugify (lines 13–19), generateFilename (lines 31–37)

5. **Provider Selection Logic**: Can size-aware selection produce incorrect results? What
   if no size-capable providers are available? What if the selected provider's generate()
   throws after selection?
   Focus: `src/index.ts` lines 64–71 (size-aware selection block)

6. **Style Injection**: The style parameter is prepended to the prompt as `${style}, ${prompt}`.
   Can this be abused to override the prompt entirely? Could adversarial styles break
   provider APIs?
   Focus: `src/index.ts` line 92 (effectivePrompt construction)

7. **Memory Safety**: Large images are held as Buffers in memory. What's the maximum
   buffer size from each provider? Can a provider return a huge image and crash the server?
   Focus: All provider generate() methods — base64 decoding, fetch-to-buffer

8. **Environment Variable Handling**: What happens with malformed env vars? Empty strings?
   Whitespace? Invalid provider names in IMAGE_GEN_DEFAULT_PROVIDER?
   Focus: `src/index.ts` line 32 (DEFAULT_PROVIDER cast), provider constructors

9. **Startup Behavior**: What if default provider (grok) is not available but other
   providers are? Is the warning sufficient or should it be an error?
   Focus: `src/index.ts` main() function (lines 334–352)

10. **Type Safety**: Are there any `as` casts or type assertions that could mask runtime
    errors? Check every `as` keyword in the codebase.
    Focus: `src/index.ts` line 32 (`as ProviderName`), `src/providers/openai.ts` line 32
    (`as` size union), `src/providers/replicate.ts` line 28 (template literal cast)

## Output Format

For each issue found, report:
- **Severity**: CRITICAL / HIGH / MEDIUM / LOW / INFO
- **Category**: Security / Bug / Design / Performance / Robustness
- **Location**: file:line_range
- **Description**: What the problem is
- **Impact**: What could go wrong in practice
- **Fix**: Concrete code change to resolve it
```

---

## Phase 2: Post-Processing

```
You are performing an adversarial code review. Your job is to find bugs, security
vulnerabilities, edge cases, race conditions, and design flaws. Be skeptical. Assume
the code has problems until proven otherwise. Do not praise the code — only report issues.

## Project Context

This is an MCP server that provides multi-provider image generation with post-processing.
It uses the `sharp` library (v0.34.5) for image manipulation. Phase 2 added:
- Image processing engine using sharp (resize, crop, aspect crop, circle mask)
- Composable operation pipeline (applyOperations)
- process_image MCP tool with operation chaining
- Metadata response with original/output dimensions

## Requirements Implemented

- PROC-01: Resize with fit modes (cover, contain, fill)
- PROC-02: Crop with x/y/w/h coordinates
- PROC-03: Aspect crop to standard ratios (1:1, 16:9, 9:16, 4:3, 3:4) with gravity
- PROC-04: Circle mask with transparent background
- PROC-05: Composable operations chain in order via array
- PROC-06: Response includes original/output size and operations applied

## Files to Review

Read these files in full before beginning your review:

- `src/utils/processing.ts` — Image processing engine (all operations + pipeline)
- `src/index.ts` — process_image MCP tool (lines 140–217)
- `package.json` — Dependencies (sharp v0.34.5, node-addon-api, node-gyp)

## Review Dimensions

Evaluate EACH of these dimensions. Read the relevant code, then report findings:

1. **Integer Overflow / Dimension Bugs**: What happens when crop coordinates exceed image
   dimensions? When width/height are 0? Negative? When both resize width and height are
   omitted? Can `Math.round` produce off-by-one errors that cause sharp to throw?
   Focus: `src/utils/processing.ts` — crop() lines 75–85, resize() lines 61–70,
   aspectCrop() lines 90–152

2. **Aspect Crop Math**: Is the aspect ratio calculation correct for all 5 ratios? What
   happens when sourceWidth or sourceHeight is 0 (from metadata failure)? Can cropWidth
   or cropHeight exceed source dimensions due to rounding? Does the gravity logic handle
   all 5 gravity values correctly for both horizontal and vertical crops?
   Focus: `src/utils/processing.ts` aspectCrop() — the division at line 94
   (`sourceWidth / sourceHeight` when sourceHeight is 0), the rounding at lines 110 and
   127, the gravity if/else chains at lines 113–123 and 130–140

3. **Circle Mask Edge Cases**: What happens with non-square inputs? Very small images
   (1x1, 2x3)? Does the SVG mask produce correct results for odd dimensions (radius is
   not integer)? Is the `dest-in` blend mode correct for producing transparency?
   Focus: `src/utils/processing.ts` circleMask() lines 157–188 — diameter calculation
   at line 164, SVG construction at lines 174–178

4. **Memory Pressure**: Each operation creates a new Buffer via sharp and the old one
   becomes eligible for GC. For a pipeline of N operations on a large image, what's
   the peak memory? Can this OOM the Node.js process?
   Focus: `src/utils/processing.ts` applyOperations() lines 193–245 — the sequential
   buffer replacement pattern

5. **Input Validation Gaps**: The process_image tool uses `operations as ProcessingOperation[]`
   — a type assertion bypassing runtime checks. Can the Zod schema let through invalid
   data that crashes sharp? Specifically: can negative x/y values pass Zod's z.number()?
   Can crop width+x exceed image width?
   Focus: `src/index.ts` line 176 (type assertion), Zod schema at lines 145–167

6. **File System Security**: inputPath is user-provided with no validation. Can it read
   `/etc/passwd` or other sensitive files? Does the tool enforce that the input is
   actually an image? What happens if inputPath points to a very large non-image file?
   Focus: `src/index.ts` line 173 (fs.promises.readFile with no size limit)

7. **Default Output Path Logic**: `inputPath.replace(/\.png$/i, '_processed.png')` — what
   if inputPath doesn't end in .png? (e.g., `photo.jpg` → `photo.jpg`, unchanged, then
   fails the .png check). What if inputPath has no extension at all?
   Focus: `src/index.ts` line 179 (replace regex), line 180 (.png check)

8. **Pipeline Failure Semantics**: If operation 3 of 5 fails, what state is the file
   system in? Is the original file ever at risk of being overwritten? What error
   information does the user get about WHICH operation failed?
   Focus: `src/utils/processing.ts` applyOperations() — the for loop with no
   try/catch per operation, `src/index.ts` error handler at lines 203–216

9. **Concurrency**: Two concurrent process_image calls on the same input file — any
   issues? What about concurrent calls writing to the same output path?
   Focus: `src/index.ts` lines 173, 188 (readFile and writeFile without locks)

10. **sharp Library Concerns**: Is the SVG string interpolation in circleMask a potential
    XML injection vector? (The diameter/radius come from image metadata, but what if
    metadata is corrupted?) Does sharp handle malformed/truncated PNG inputs gracefully
    or does it crash the process?
    Focus: `src/utils/processing.ts` lines 174–178 (SVG template literal with
    interpolated numbers)

## Output Format

For each issue found, report:
- **Severity**: CRITICAL / HIGH / MEDIUM / LOW / INFO
- **Category**: Security / Bug / Design / Performance / Robustness
- **Location**: file:line_range
- **Description**: What the problem is
- **Impact**: What could go wrong in practice
- **Fix**: Concrete code change to resolve it
```

---

## Phase 3: Asset Pipeline

```
You are performing an adversarial code review. Your job is to find bugs, security
vulnerabilities, edge cases, race conditions, and design flaws. Be skeptical. Assume
the code has problems until proven otherwise. Do not praise the code — only report issues.

## Project Context

This is an MCP server providing multi-provider image generation with post-processing
and an asset pipeline. Phase 3 added:
- Asset preset definitions (profile_pic, post_image, hero_photo, avatar, scene)
- Clean filename support via assetId parameter
- generate_asset MCP tool combining generation + processing in one call
- Size-aware provider selection using preset-defined generation sizes

## Requirements Implemented

- ASSET-01: generate_asset combines generation + post-processing in one call
- ASSET-02: profile_pic preset: square gen, 1:1 crop, circle mask, resize 200x200
- ASSET-03: post_image preset: landscape gen, 16:9 crop, resize 1200x675
- ASSET-04: hero_photo preset: portrait gen, 9:16 crop, resize 1080x1920
- ASSET-05: avatar preset: square gen, 1:1 crop, circle mask, resize 80x80
- ASSET-06: scene preset: landscape gen, 16:9 crop, resize 1200x675
- ASSET-07: Asset ID-based output produces clean filenames (no date/hash prefix)

## Files to Review

Read these files in full before beginning your review:

- `src/utils/presets.ts` — Asset preset definitions (AssetType, AssetPreset, ASSET_PRESETS, getPreset)
- `src/utils/image.ts` — Path resolution with assetId support (resolveOutputPath priority chain)
- `src/index.ts` — generate_asset MCP tool (lines 219–331), also reference generate_image
  tool (lines 41–137) for comparison of duplicated logic
- `src/utils/processing.ts` — Processing operations used in presets (for context)
- `src/providers/index.ts` — Provider interface and registry (for context)

## Review Dimensions

Evaluate EACH of these dimensions. Read the relevant code, then report findings:

1. **assetId Injection / Path Traversal**: The assetId is directly interpolated into
   `${assetId}.png` with zero sanitization in `src/utils/image.ts` (lines 62–67 and
   79–81). Can `../../etc/cron.d/evil` as an assetId write to arbitrary locations?
   Can it contain null bytes, slashes, or other path-special characters? The Zod schema
   at `src/index.ts` only validates `z.string().optional()` — no pattern constraint.

2. **Preset Correctness**: Are the preset operation sequences mathematically correct?
   For profile_pic: aspectCrop 1:1 on a square image is a no-op, then circleMask, then
   resize to 200x200. But what if the AI provider returns a non-square image when
   asked for "square"? Do all presets handle imprecise provider output?
   Focus: `src/utils/presets.ts` — all 5 preset operation arrays

3. **Race Condition on Clean Filenames**: Two concurrent `generate_asset` calls with
   the same assetId will resolve to the same output path (e.g., `my-avatar.png`). The
   second write silently overwrites the first. Is this intended? Should there be a
   uniqueness suffix or a conflict check?
   Focus: `src/utils/image.ts` lines 62–67 (outputDir+assetId path)

4. **Type Safety of `assetType as AssetType`**: At `src/index.ts` line 240, the code
   casts `assetType as AssetType` after Zod validation. If an invalid value somehow
   passes through, `getPreset()` at `src/utils/presets.ts` line 63 returns
   `ASSET_PRESETS[assetType]` which would be `undefined`. The code then accesses
   `preset.generationSize` — crash. Is the Zod enum guaranteed to match the
   TypeScript type exactly?

5. **Pipeline Failure Modes**: If generation succeeds (API cost incurred) but processing
   fails (e.g., sharp crashes), the generated image is lost — never saved to disk.
   Should there be a fallback to save the raw image?
   Focus: `src/index.ts` lines 277–284 (generate) then line 286 (applyOperations) —
   no intermediate save

6. **Cost Implications**: generate_asset always calls a paid API. If processing fails
   after generation, the API cost is wasted with no output file. What is the user
   experience? Do they know what went wrong?
   Focus: `src/index.ts` error handler at lines 315–328 — does it distinguish
   generation errors from processing errors?

7. **preset.generationSize Truthiness Check**: At `src/index.ts` line 248, the
   condition checks `preset.generationSize && !imageProvider.supportsSize`. But
   generationSize is always a non-empty string ('square', 'landscape', 'portrait')
   — always truthy. Is this check meaningful or dead code masking a logic error?

8. **Duplicate Logic**: generate_asset (lines 219–331) duplicates provider selection,
   style prepend, error formatting, and path resolution logic from generate_image
   (lines 41–137). If one is updated (e.g., Phase 4 adds reference support), the
   other must be updated separately. Audit both for existing divergences.

9. **post_image and scene Are Identical**: In `src/utils/presets.ts`, both post_image
   (lines 27–33) and scene (lines 55–61) use: landscape generation, 16:9 aspect crop,
   resize 1200x675. The only difference is the description string. Is this intentional
   semantic distinction or a copy-paste error?

10. **hero_photo Resize Upscaling**: hero_photo resizes to 1080x1920 via
    `src/utils/presets.ts` lines 38–40. But providers typically produce portrait images
    at 1024x1792 (OpenAI) or similar. This means the resize with fit='cover' is
    UPSCALING, which degrades quality. Verify actual provider output dimensions vs
    preset target dimensions.

11. **Error Response Information Leakage**: Error messages from provider API calls may
    contain API keys, internal URLs, rate limit details, or account info. These are
    passed directly to the MCP response via `error.message`.
    Focus: `src/index.ts` lines 316–317 (error catch block)

12. **No Timeout on Generation**: Provider API calls have no timeout. If an API hangs
    indefinitely, the MCP tool blocks forever with no way for the user to cancel.
    Focus: All provider generate() methods — none use AbortController or timeouts

## Output Format

For each issue found, report:
- **Severity**: CRITICAL / HIGH / MEDIUM / LOW / INFO
- **Category**: Security / Bug / Design / Performance / Robustness
- **Location**: file:line_range
- **Description**: What the problem is
- **Impact**: What could go wrong in practice
- **Fix**: Concrete code change to resolve it
```
