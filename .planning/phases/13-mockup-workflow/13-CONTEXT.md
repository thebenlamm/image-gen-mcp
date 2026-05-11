# Phase 13: Mockup Workflow - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Autonomous — grey areas resolved by Zed + Matt

<domain>
## Phase Boundary

Add a template fast-path to `image_task` that recognizes a brand mockup goal and produces a two-node plan: (1) generate a clean scene image with no text in the prompt, then (2) composite an SVG wordmark at caller-specified placement parameters using `composite_layers:sharp`. Document the pattern in CLAUDE.md and AGENTS.md with a concrete example.

**In scope:**
- New `brand-mockup` template in `src/task/templates.ts`
- Prompt sanitization: strip typography/text instructions from the generate prompt at template construction time
- SVG wordmark input passed via `input_images` using a named key (`svg_wordmark`)
- Placement params wired directly into the composite node (`x`, `y`, `scale`, `anchor`)
- Template trigger: normalized goal must match `brand_mockup` or `brand-mockup`
- CLAUDE.md and AGENTS.md updates with concrete usage example (MOCK-02)
- Unit test asserting the template matches and produces a prompt free of text instructions

**Out of scope:**
- Haiku planning of mockup goals (template covers it deterministically)
- SVG rasterization or conversion — sharp reads SVG natively; no preprocessing step needed
- Planner constraint updates or system prompt changes
- Any new capability implementation (all ops are already registered)
- Multi-wordmark compositing (single SVG layer is sufficient for v2.1)

</domain>

<decisions>
## Implementation Decisions

### Decision 1: Template, not Haiku planning
**Zed:** Template is the obvious call. The two-step generate → composite pattern is fully deterministic. There are no routing decisions to make: the generate node picks the best available `generate` provider by quality score (already handled by the planner for non-template calls, and by explicit provider selection for templates), and the composite is always `sharp`. Haiku adds cost (~$0.0002), latency (~2-5s), and failure modes for zero upside here.

**Matt:** Agreed. The whole point of templates is to capture patterns where Haiku's judgment adds no value. This is one of them. One risk: if the caller goal is something like "brand mockup for our hero shot but make sure you drop a shadow too", it won't match the normalized key and falls through to Haiku — which is correct behavior. Templates are fast-paths for exact intents.

**Decision:** Template fast-path. Template IDs: `brand-mockup` and `brand_mockup` (both keys, matching the existing `product-on-white`/`product_on_white` pattern).

---

### Decision 2: SVG wordmark input convention
**Matt:** The existing `input_images` parameter is a flat string array positionally mapped to `image_0`, `image_1`, etc. (see `inputImagesByRef` in `src/index.ts` line 917). That's too implicit for a two-input mockup (which image is the SVG?). We need a named key.

**Zed:** We can't change the MCP tool schema to add a named SVG key without a schema change — that's a bigger lift. But the template can use a convention: the caller passes the SVG path as `input_images[0]` and the template references it as `$inputs.image_0`. That's exactly what `firstInputRef()` does already for `product-on-white`. No schema changes needed.

**Matt:** Fine, but we need to document the convention clearly. The example must show `input_images: ["/path/to/wordmark.svg"]` so there's no ambiguity about ordering. The template should validate that `firstInputRef()` returns non-null (i.e., at least one input image exists) and return `null` if not — failing over to Haiku, which will attempt its own plan.

**Decision:** SVG wordmark is `input_images[0]`, referenced as `$inputs.image_0` in the composite node. Template returns `null` if no input images provided (consistent with `productOnWhite` and `logoCleanup` patterns). Document the ordering convention in CLAUDE.md and AGENTS.md examples.

---

### Decision 3: Generate node provider selection
**Zed:** Templates today hard-code providers (e.g., `@imgly/local`, `sharp`, `replicate`). For the generate node, we want quality-score routing, but templates bypass Haiku entirely. Options: (a) hard-code `ideogram` (best text-fidelity `generate` provider), (b) hard-code `openai` (most reliable), (c) let the template pick the first registered `generate` provider with a quality score.

**Matt:** Option (c) is elegant but adds complexity — the template would need to call `registry.list('generate')` and sort. Option (a) hard-codes ideogram which only works if the key is set; template would return null, falling through to Haiku. Option (b) openai is safe but ignores quality routing. The actual goal of the generate step is a clean scene — text fidelity doesn't matter here, only scene composition quality. OpenAI gpt-image-1 is the most reliable for that.

**Zed:** Hard-code `openai`. If OpenAI isn't registered (no key), the template's `registry.get('generate', 'openai')` check fails and the template returns null — Haiku takes over. That's the right fallback.

**Decision:** Generate node: `op: generate`, `provider: openai`. Template registry-guards this: if `composite_layers:sharp` or `generate:openai` isn't registered, return `null` (Haiku fallback). Cost estimate: $0.04 for generate + $0 for composite = $0.04 total.

---

### Decision 4: Prompt sanitization — how to strip text instructions
**Matt:** The biggest correctness requirement for MOCK-01 is that the generate step's prompt contains NO text or typography instructions. The goal string the caller passes ("brand mockup with 'Acme Co' wordmark on a coffee mug in warm lighting") will typically include the brand name or product copy. We must not pass that verbatim to the generate node.

**Zed:** The template constructs the prompt itself — it does not pass the goal string through. The template derives a sanitized scene description from the goal using a simple strategy: use the goal as context to understand the scene, then build the prompt as `{scene description without any text/wordmark/typography mentions}`. Practically: the template should produce a hardcoded scene prompt pattern that excludes all text content, or extract the scene noun from the goal.

**Matt:** Simpler and more reliable: the template builds the generate prompt as a fixed pattern like `"A clean product scene: {scene_descriptor}. No text, no labels, no typography."` where `{scene_descriptor}` is derived by stripping known text-indicator words from the goal. But that's fragile. Even simpler: don't try to parse the goal for scene extraction — instead, use the entire goal string stripped of wordmark/text/label references as a suffix hint, and always prepend the no-text instruction.

**Decision:** The template constructs the generate prompt as:
```
{goal}, photorealistic product scene, clean surfaces, no text, no labels, no typography, no words, no lettering
```
Where `{goal}` is the raw goal string. The explicit negative prompting (`no text, no labels, no typography, no words, no lettering`) is the authoritative mechanism — not goal parsing. This is simpler, more robust, and works even if the goal contains brand names (the negative prompt overrides). The suffix is hardcoded in the template builder.

---

### Decision 5: composite_layers node params — placement API
**Matt:** Looking at `composite-layers.ts`, the sharp capability accepts: `canvas: {width, height, background?}`, `layers: [{input, x?, y?, scale?, opacity?, anchor?}]`. Anchor is one of `top-left | center | top-right | bottom-left | bottom-right`. No percentages, no named semantic anchors beyond those five. x/y are absolute pixels relative to the canvas, interpreted through the anchor point.

**Zed:** The template needs to pick defaults that work without caller-specified placement. Default: `anchor: top-left`, `x: 0`, `y: 0`, `scale: 1.0`. But we want the caller to be able to override placement via... the goal? The constraints? There's no structured placement param in `image_task` today.

**Matt:** Don't add new params just for this template — that's scope creep. The template uses sensible defaults. Callers who want precise placement use `image_op` directly with `composite_layers:sharp`. The `image_task` mockup template is for the 80% case: wordmark in a reasonable position.

**Decision:** Template uses these composite defaults:
- Canvas: match the generate output size (use `output_size` constraint: square=2000×2000, landscape=2000×1125, portrait=1125×2000, default square)
- Background: transparent (`{r:0, g:0, b:0, alpha:0}`) so the generated scene is the visual base
- Layer 0 (generated scene): `input: $nodes.generate.output`, `anchor: top-left`, `x: 0`, `y: 0` — fills canvas
- Layer 1 (SVG wordmark): `input: $inputs.image_0`, `anchor: top-left`, `x: 40`, `y: 40`, `scale: 0.25` — upper-left placement at 25% scale

Wait — `composite_layers` creates a canvas and composites layers onto it. It does NOT support using a generated image as the canvas background directly by filling via a layer (the canvas is a flat-color or transparent base). So the plan is: layer[0] is the scene image (fills the canvas), layer[1] is the SVG. The scene image will be scaled to fill if needed using `scale`, but the generate output from OpenAI is already 1024×1024 by default.

**Revised Decision:** Canvas is 1024×1024 (match OpenAI default output), transparent background. Layer 0: generated scene at `anchor: top-left`, `x: 0`, `y: 0`, `scale: 1.0`. Layer 1: SVG wordmark at `anchor: bottom-left`, `x: 40`, `y: {canvas_height - 40}`, `scale: 0.3`. Bottom-left placement keeps the wordmark readable without obscuring the hero product.

For `output_size` constraint handling: the generate node takes `params.size` (square/landscape/portrait), and the composite canvas matches accordingly using the same size map as `productOnWhite`. Compute `y` for the bottom-left wordmark anchor as `canvas.height - 40`.

---

### Decision 6: Two-node DAG structure — exact node shapes
**Zed + Matt:** Two nodes: `generate` (id: `scene`) and `composite_layers` (id: `composite`). Terminal node: `composite`.

```
Node: scene
  op: generate
  provider: openai
  params:
    prompt: "{goal}, photorealistic product scene, clean surfaces, no text, no labels, no typography, no words, no lettering"
    size: <from output_size constraint, omitted if square/default>
  dependsOn: []
  outputKind: image
  costUsd: 0.04
  latencyMs: 12000
  reason: "template:brand-mockup generate clean scene"

Node: composite
  op: composite_layers
  provider: sharp
  params:
    canvas: { width: <W>, height: <H>, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    layers:
      - { input: "$nodes.scene.output", anchor: "top-left", x: 0, y: 0, scale: 1.0 }
      - { input: "$inputs.image_0", anchor: "bottom-left", x: 40, y: <H - 40>, scale: 0.3 }
  dependsOn: [scene]
  outputKind: image
  costUsd: 0
  latencyMs: 400
  reason: "template:brand-mockup composite SVG wordmark"
```

Total plan: estimatedTotalCostUsd=0.04, estimatedTotalLatencyMs=12400.

---

### Decision 7: CLAUDE.md and AGENTS.md update scope (MOCK-02)

**Matt:** The success criterion says "concrete mockup example showing the goal string, input_images reference for the SVG, and expected plan structure." That's three things: (1) what goal string to use, (2) how to reference the SVG via input_images, (3) what the plan output looks like. Keep it tight — a usage example block with a dry_run: true call to show the plan, not a full pedagogical section.

**Zed:** CLAUDE.md already has a "Using The MCP From Claude Code" section with `image_task` examples. Add a fourth example there for mockup. AGENTS.md doesn't have a usage examples section — add a "Mockup Workflow" section under "Important Runtime Rules" with a one-paragraph conceptual note and the concrete example.

**Decision:** 
- **CLAUDE.md**: Add a fourth code block under "Using The MCP From Claude Code" showing the mockup goal, SVG input_images, and a note about the two-step plan. Keep it to the example + one explanation sentence.
- **AGENTS.md**: Add a new "## Mockup Workflow" section after "## Important Runtime Rules" explaining the generate-then-composite pattern (3-4 sentences) plus the concrete tool call example with `dry_run: true`.

---

### Decision 8: Plan count for Phase 13
**Zed:** Two plans: (1) template implementation + tests, (2) CLAUDE.md + AGENTS.md documentation updates.

**Matt:** Agreed. The documentation update is non-trivial enough to be its own plan — it requires reading both files, placing the examples correctly, and verifying the format matches the existing style. Separate plan keeps the diff reviewable.

**Decision:** 2 plans.
- `13-01-PLAN.md` — Add `brand-mockup` template to `templates.ts`, unit test for template match and prompt sanitization
- `13-02-PLAN.md` — Update CLAUDE.md and AGENTS.md with mockup pattern documentation and examples

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

**Template pattern (`src/task/templates.ts`):**
- `TemplateBuilder = (input: PlannerInput) => Plan | null`
- `firstInputRef(input)` — returns `$inputs.image_0` for first entry in `input.inputImages`, or `null`
- `normalizeGoal(goal)` — `trim().toLowerCase().replace(/\s+/g, '_')`
- `TEMPLATE_BUILDERS` record — keys are normalized goal strings or hyphenated aliases
- Template is rejected if any node's `(op, provider)` pair is not registered in the registry
- Template is rejected if `PlanSchema.safeParse(plan)` fails

**composite_layers:sharp invoke contract (`src/capabilities/composite-layers.ts`):**
```typescript
params: {
  canvas: { width: number; height: number; background?: sharp.Color }
  layers: Array<{
    input: string;          // absolute file path (resolved from ref)
    x?: number;             // absolute pixels, default 0
    y?: number;             // absolute pixels, default 0
    scale?: number;         // 0.05-10, default 1
    opacity?: number;       // 0-1, default 1
    anchor?: 'top-left' | 'center' | 'top-right' | 'bottom-left' | 'bottom-right'; // default top-left
  }>
}
```
Returns: `{ kind: 'image', buffer: Buffer, model: 'sharp-composite@1', metadata: { canvasWidth, canvasHeight, layerCount } }`

**Sharp SVG support:** Sharp reads SVG natively via `sharp(buffer).png().toBuffer()` — no rasterization preprocessing needed. SVG is treated as any other layer input.

**generate:openai invoke contract:**
- `params: { prompt: string; size?: 'square' | 'landscape' | 'portrait' }`
- Default output: 1024×1024 PNG (square). Size values map to provider-specific dimensions.

**Ref resolver (`src/task/ref-resolver.ts`):**
- `$nodes.<id>.output` resolves to the `artifactPath` string for image nodes
- `$inputs.<name>` resolves to the input path string
- Deep object traversal: nested arrays and objects are resolved recursively — so `layers[1].input: "$inputs.image_0"` is resolved correctly at execution time

**plan-validator.ts — composite_layers ref handling:**
- `imageInputFields` for `composite_layers` iterates `node.params.layers` and returns each `layer.input` — this is how the validator checks input refs and path guards for composite nodes (line 87-100)

**Size map (from `productOnWhite` template):**
```typescript
const canvasBySize = {
  square: { width: 2000, height: 2000 },
  landscape: { width: 2000, height: 1125 },
  portrait: { width: 1125, height: 2000 },
};
const canvas = canvasBySize[input.constraints?.output_size ?? 'square'];
```
For the mockup template, use the same map. The OpenAI generate node should receive `params.size` matching the constraint (omit if square, since square is the OpenAI default).

### Established Patterns

- Template returns `null` if `firstInputRef()` is null (no input images) — matches `productOnWhite`, `logoCleanup`, `upscaleExport`
- Template returns `null` if any required `(op, provider)` pair is missing from registry
- Template returns `null` if `PlanSchema.safeParse(plan).success` is false
- Keys registered in `TEMPLATE_BUILDERS` as both hyphen and underscore forms
- `routingNotes` is optional in `PlanSchema` — templates do not need to include it

### Integration Points

- `src/task/templates.ts` — add `brandMockup: TemplateBuilder` and register as `'brand-mockup'` and `'brand_mockup'`
- `src/index.ts` — no changes required (template mechanism already integrated)
- Test file: likely `src/task/templates.test.ts` or similar — check existing test structure first
- `CLAUDE.md` "Using The MCP From Claude Code" section — add fourth example block
- `AGENTS.md` — add "## Mockup Workflow" section

</code_context>

<specifics>
## Specific Ideas

### Template implementation sketch

```typescript
const brandMockup: TemplateBuilder = (input) => {
  const svgRef = firstInputRef(input);
  if (!svgRef) return null;

  const canvasBySize = {
    square: { width: 1024, height: 1024 },
    landscape: { width: 1792, height: 1024 },
    portrait: { width: 1024, height: 1792 },
  } as const;
  const canvas = canvasBySize[input.constraints?.output_size ?? 'square'];

  // Sanitize: no matter what the goal says, the generate prompt explicitly
  // excludes text so that typography is handled solely by the SVG layer.
  const scenePrompt = `${input.goal}, photorealistic product scene, clean surfaces, no text, no labels, no typography, no words, no lettering`;

  const generateParams: Record<string, unknown> = { prompt: scenePrompt };
  if (input.constraints?.output_size && input.constraints.output_size !== 'square') {
    generateParams.size = input.constraints.output_size;
  }

  const nodes: PlanNode[] = [
    {
      id: 'scene',
      op: 'generate',
      provider: 'openai',
      params: generateParams,
      dependsOn: [],
      outputKind: 'image',
      costUsd: 0.04,
      latencyMs: 12000,
      reason: 'template:brand-mockup generate clean scene',
    },
    {
      id: 'composite',
      op: 'composite_layers',
      provider: 'sharp',
      params: {
        canvas: { ...canvas, background: { r: 0, g: 0, b: 0, alpha: 0 } },
        layers: [
          { input: '$nodes.scene.output', anchor: 'top-left', x: 0, y: 0, scale: 1.0 },
          { input: svgRef, anchor: 'bottom-left', x: 40, y: canvas.height - 40, scale: 0.3 },
        ],
      },
      dependsOn: ['scene'],
      outputKind: 'image',
      costUsd: 0,
      latencyMs: 400,
      reason: 'template:brand-mockup composite SVG wordmark',
    },
  ];

  return {
    version: 1,
    goal: input.goal,
    nodes,
    terminalNodeId: 'composite',
    estimatedTotalCostUsd: 0.04,
    estimatedTotalLatencyMs: 12400,
  };
};
```

Note on canvas dimensions: OpenAI's gpt-image-1 produces 1024×1024 for square, so canvas matches. If `output_size` is landscape or portrait, pass the appropriate `size` param to generate and use the matching canvas. Verify actual OpenAI landscape/portrait pixel dimensions from the provider before hardcoding — check `src/providers/openai.ts` `supportsSize` shape.

### Prompt sanitization test

Unit test assertions:
1. `matchTemplate({ goal: 'brand-mockup', inputImages: { image_0: '/tmp/logo.svg' } })` returns a `TemplateMatch` with `templateId: 'brand-mockup'`
2. The `scene` node's `params.prompt` includes all five negative terms: `no text`, `no labels`, `no typography`, `no words`, `no lettering`
3. The `scene` node's `params.prompt` does NOT contain any text from a goal like "brand-mockup with 'Acme' wordmark" other than the goal passthrough (goal passthrough is acceptable; the negative suffix is the authoritative control)
4. The `composite` node's `layers[1].input` equals `'$inputs.image_0'`
5. `matchTemplate({ goal: 'brand-mockup', inputImages: {} })` returns `null` (no input images → no SVG → reject)
6. `matchTemplate({ goal: 'something unrelated', inputImages: { image_0: '/tmp/logo.svg' } })` returns `null` (no template match)

### CLAUDE.md example block

Add to "Using The MCP From Claude Code" section:

```text
Use image_task with goal "brand-mockup" and input_images ["/path/to/wordmark.svg"] to generate a clean scene and composite the SVG wordmark automatically.
```

Or as a structured example:
```
goal: "brand-mockup"
input_images: ["/Users/me/brand/wordmark.svg"]
constraints: { output_size: "square" }
```

Explain: the template generates a scene with no typography, then overlays the SVG at bottom-left (25% scale). Use `dry_run: true` to preview routing. For custom placement, use `image_op` with `composite_layers:sharp` directly.

### AGENTS.md example section

```markdown
## Mockup Workflow

`image_task` with goal `"brand-mockup"` triggers a template that separates scene generation from wordmark compositing. The generate step receives a prompt with explicit negative typography instructions; the SVG wordmark is placed via `composite_layers:sharp` on top. This preserves pixel-perfect text fidelity without relying on the AI model to render type.

Pass the SVG path as `input_images[0]`. Example:

```json
{
  "goal": "brand-mockup",
  "input_images": ["/Users/me/brand/wordmark.svg"],
  "constraints": { "output_size": "square" },
  "dry_run": true
}
```

For precise wordmark placement (x, y, scale, anchor), use `image_op` with `composite_layers:sharp` directly after generating the scene.
```

</specifics>

<deferred>
## Deferred Ideas

- Named placement parameters in `image_task` constraints (e.g., `wordmark_anchor`, `wordmark_scale`) — wait until there is a concrete use case beyond the default placement; callers who need control can use `image_op` + `composite_layers:sharp` directly
- Multi-wordmark compositing (multiple SVG layers) — not needed for v2.1; single wordmark is the standard mockup case
- Haiku fallback prompt-sanitization for non-template mockup goals — if Haiku picks up a mockup goal that didn't match the template, the planner system prompt already instructs against inventing text in prompts; no changes needed
- Eval cases for the brand-mockup template (measure scene composition quality vs. text-bleed failure rate) — defer to a future milestone eval pass
- Support for PNG wordmarks (non-SVG overlay) — sharp handles PNG layers already; just document this is possible via `image_op` rather than complicating the template

</deferred>
