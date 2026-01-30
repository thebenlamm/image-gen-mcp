# Phase 1: Core Enhancements - Context

**Gathered:** 2026-01-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Enhance the existing `generate_image` MCP tool with output path control, style modifiers, and smarter provider selection. No new MCP tools. No image processing. No automatic fallback chain.

</domain>

<decisions>
## Implementation Decisions

### Output path control
- New `outputPath` parameter: exact file path, image saves to that location
- New `outputDir` parameter: directory only, filename auto-generates with existing date/provider/hash pattern
- Priority: `outputPath` > `outputDir` > `IMAGE_GEN_OUTPUT_DIR` env var > default `~/Downloads/generated-images`
- Parent directories auto-created (mkdir -p behavior) — personal tool, eliminate friction
- `outputPath` must end in `.png` (PNG-only output)

### Style modifier
- Freeform string parameter, not a preset enum
- Appended/prepended to user's prompt before calling provider.generate()
- Providers stay unaware of style — it's purely prompt engineering
- Same style string goes to all providers unchanged (no provider-specific templates)
- If style produces poor results on a given provider, user rephrases — not our problem to solve

### Provider selection with size awareness
- Default provider changes from `openai` to `grok`
- When user specifies a `size` parameter (landscape/portrait), skip Grok automatically since it doesn't support size
- Fall through to next available provider that supports size (Gemini, OpenAI, etc.)
- This is NOT a general fallback chain — it's provider capability filtering at selection time

### Error handling (no automatic fallback)
- If the selected provider fails, return the error to the user
- Response includes: error message, which provider failed, list of available providers
- User decides whether to retry with a different provider — no silent fallback
- This keeps behavior predictable and debuggable

### Response metadata
- Response always includes which provider was actually used (important when size-based selection changes the provider)
- Existing fields preserved: success, path, provider, model, revisedPrompt

### Default provider change
- Hardcoded default changes from `'openai'` to `'grok'` in index.ts
- `IMAGE_GEN_DEFAULT_PROVIDER` env var still overrides

</decisions>

<specifics>
## Specific Ideas

- Size-aware provider selection is a targeted capability check, not a general fallback mechanism
- Error responses should be clear enough that Claude Code can suggest "try provider X instead" without needing fallback logic in the server

</specifics>

<deferred>
## Deferred Ideas

- Automatic provider fallback chain — removed from Phase 1; if needed later, would be its own phase
- Provider-specific style templates — over-engineering for now; revisit only if style quality across providers becomes a real problem

</deferred>

---

*Phase: 01-core-enhancements*
*Context gathered: 2026-01-30*
