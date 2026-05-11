import { describe, expect, it } from 'vitest';
import type { Capability, CapabilityOp } from '../../src/capabilities/types.js';
import { ASSET_PRESETS, type AssetType } from '../../src/utils/presets.js';
import { PlanSchema, type Plan } from '../../src/task/plan-schema.js';
import { listTemplateIds, matchTemplate } from '../../src/task/templates.js';

const ASSET_TYPES = Object.keys(ASSET_PRESETS) as AssetType[];

function makeCapability(op: CapabilityOp, provider: string): Capability {
  return {
    op,
    provider,
    modelVersion: `${provider}-${op}-test`,
    constraints: {},
    cost: { perCallUsd: 0 },
    invoke: async () => ({ kind: 'image' as const, buffer: Buffer.from('png'), model: 'test' }),
  };
}

function makeRegistry(includeUpscale = true) {
  const capabilities = new Map<string, Capability>();
  for (const cap of [
    makeCapability('transform', 'sharp'),
    makeCapability('extract_subject', '@imgly/local'),
    makeCapability('composite_layers', 'sharp'),
    ...(includeUpscale ? [makeCapability('enhance_upscale', 'replicate')] : []),
  ]) {
    capabilities.set(`${cap.op}:${cap.provider}`, cap);
  }

  return {
    get: (op: CapabilityOp, provider: string) => capabilities.get(`${op}:${provider}`),
    list: (op?: CapabilityOp) => [...capabilities.values()].filter((cap) => op === undefined || cap.op === op),
  };
}

function makeRegistryWithGenerate() {
  const base = makeRegistry();
  const generateCap = makeCapability('generate', 'openai');
  return {
    get: (op: CapabilityOp, provider: string) =>
      base.get(op, provider) ?? (op === 'generate' && provider === 'openai' ? generateCap : undefined),
    list: (op?: CapabilityOp) => [
      ...base.list(op),
      ...(op === undefined || op === 'generate' ? [generateCap] : []),
    ],
  };
}

function makeExpandedRegistry() {
  const registry = makeRegistry();
  const capabilities = [
    makeCapability('extract_subject', 'photoroom'),
    makeCapability('composite_layers', 'photoroom'),
    makeCapability('edit_prompt', 'fal'),
    makeCapability('generate', 'ideogram'),
  ];

  return {
    get(op: CapabilityOp, provider: string) {
      return registry.get(op, provider) ?? capabilities.find((cap) => cap.op === op && cap.provider === provider);
    },
    list(op?: CapabilityOp) {
      return [
        ...registry.list(op),
        ...capabilities.filter((cap) => op === undefined || cap.op === op),
      ];
    },
  };
}

function expectValidPlan(plan: Plan): Plan {
  return PlanSchema.parse(plan);
}

function terminalNode(plan: Plan) {
  return plan.nodes.find((node) => node.id === plan.terminalNodeId);
}

describe('matchTemplate', () => {
  it('matches profile_pic and uses ASSET_PRESETS operations by reference', () => {
    const match = matchTemplate(
      { goal: 'profile_pic', inputImages: { in: '/x.png' }, constraints: {} },
      makeRegistry(),
    );

    expect(match?.templateId).toBe('profile_pic');
    expectValidPlan(match!.plan);
    expect(match!.plan.nodes[0]!.params.operations).toBe(ASSET_PRESETS.profile_pic.operations);
  });

  it('matches avatar and terminates at a transform node', () => {
    const match = matchTemplate({ goal: 'avatar', inputImages: { in: '/x.png' } }, makeRegistry());

    expect(match?.templateId).toBe('avatar');
    expect(terminalNode(match!.plan)?.op).toBe('transform');
  });

  it('matches every ASSET_PRESETS key using operations by reference', () => {
    for (const assetType of ASSET_TYPES) {
      const match = matchTemplate({ goal: assetType, inputImages: { in: '/x.png' } }, makeRegistry());

      expect(match?.templateId).toBe(assetType);
      expectValidPlan(match!.plan);
      expect(match!.plan.nodes[0]!.params.operations).toBe(ASSET_PRESETS[assetType].operations);
    }
  });

  it('matches product-on-white as extract -> composite -> transform with white background', () => {
    const match = matchTemplate({ goal: 'product-on-white', inputImages: { product: '/p.png' } }, makeRegistry());

    expect(match?.plan.nodes.map((node) => node.op)).toEqual([
      'extract_subject',
      'composite_layers',
      'transform',
    ]);
    expect(match!.plan.terminalNodeId).toBe('transform');
    expect(match!.plan.nodes[1]!.params.canvas).toMatchObject({
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    });
  });

  it('still validates product-on-white with Phase 11 providers present', () => {
    const match = matchTemplate({
      goal: 'product-on-white',
      inputImages: { input_0: '/abs/path/img.png' },
    }, makeExpandedRegistry());

    expect(match).not.toBeNull();
    for (const node of match!.plan.nodes) {
      expect(makeExpandedRegistry().get(node.op, node.provider)).toBeDefined();
    }
  });

  it('maps product-on-white output_size constraints to canvas dimensions', () => {
    const cases = [
      ['square', { width: 2000, height: 2000 }],
      ['landscape', { width: 2000, height: 1125 }],
      ['portrait', { width: 1125, height: 2000 }],
    ] as const;

    for (const [outputSize, expectedCanvas] of cases) {
      const match = matchTemplate({
        goal: 'product-on-white',
        inputImages: { product: '/p.png' },
        constraints: { output_size: outputSize },
      }, makeRegistry());
      const compose = match!.plan.nodes[1]!;

      expect(compose.params.canvas).toMatchObject(expectedCanvas);
      expect(compose.params.layers).toEqual([
        expect.objectContaining({
          x: expectedCanvas.width / 2,
          y: expectedCanvas.height / 2,
        }),
      ]);
    }
  });

  it('matches logo-cleanup as an extract_subject terminal alpha cutout', () => {
    const match = matchTemplate({ goal: 'logo-cleanup', inputImages: { logo: '/l.png' } }, makeRegistry());

    expect(match?.plan.nodes).toHaveLength(1);
    expect(terminalNode(match!.plan)?.op).toBe('extract_subject');
  });

  it('matches upscale-export only when enhance_upscale:replicate is registered', () => {
    expect(matchTemplate({ goal: 'upscale-export', inputImages: { src: '/s.png' } }, makeRegistry(false))).toBeNull();

    const match = matchTemplate({ goal: 'upscale-export', inputImages: { src: '/s.png' } }, makeRegistry(true));
    expect(terminalNode(match!.plan)?.op).toBe('enhance_upscale');
  });

  it('returns null for templates without an input image', () => {
    expect(matchTemplate({ goal: 'profile_pic' }, makeRegistry())).toBeNull();
  });

  it('returns null for unknown goals', () => {
    expect(matchTemplate({ goal: 'render a sunset' }, makeRegistry())).toBeNull();
  });

  it('normalizes goal case and surrounding whitespace', () => {
    const match = matchTemplate({ goal: '  Profile_Pic  ', inputImages: { in: '/x.png' } }, makeRegistry());

    expect(match?.templateId).toBe('profile_pic');
  });

  it('propagates ASSET_PRESETS mutations without a template fork', () => {
    const resize = ASSET_PRESETS.avatar.operations[2] as { width: number; height: number };
    const previous = { width: resize.width, height: resize.height };
    try {
      resize.width = 96;
      resize.height = 96;
      const match = matchTemplate({ goal: 'avatar', inputImages: { in: '/x.png' } }, makeRegistry());

      expect((match!.plan.nodes[0]!.params.operations as Array<{ width?: number }>)[2]!.width).toBe(96);
    } finally {
      resize.width = previous.width;
      resize.height = previous.height;
    }
  });

  it('emits only plans that pass PlanSchema.parse', () => {
    for (const goal of [...ASSET_TYPES, 'product-on-white', 'logo-cleanup', 'upscale-export']) {
      const match = matchTemplate({ goal, inputImages: { in: '/x.png' } }, makeRegistry());

      expect(() => PlanSchema.parse(match!.plan)).not.toThrow();
    }
  });

  it('lists ASSET_PRESETS ids and explicit template ids', () => {
    expect(listTemplateIds()).toEqual(expect.arrayContaining([
      ...ASSET_TYPES,
      'product-on-white',
      'logo-cleanup',
      'upscale-export',
    ]));
  });
});

describe('brand-mockup template', () => {
  it('matches brand-mockup when generate:openai is registered', () => {
    const match = matchTemplate(
      { goal: 'brand-mockup', inputImages: { image_0: '/logo.svg' } },
      makeRegistryWithGenerate(),
    );

    expect(match?.templateId).toBe('brand-mockup');
    expect(match?.plan.nodes.map((n) => n.op)).toEqual(['generate', 'composite_layers']);
    expect(match?.plan.terminalNodeId).toBe('composite');
  });

  it('also matches brand_mockup (underscore form)', () => {
    const match = matchTemplate(
      { goal: 'brand_mockup', inputImages: { image_0: '/logo.svg' } },
      makeRegistryWithGenerate(),
    );

    expect(match?.templateId).toBe('brand_mockup');
  });

  it('scene node prompt contains all five negative typography terms', () => {
    const match = matchTemplate(
      { goal: 'brand-mockup', inputImages: { image_0: '/logo.svg' } },
      makeRegistryWithGenerate(),
    );
    const scenePrompt = match!.plan.nodes[0]!.params.prompt as string;

    expect(scenePrompt).toContain('no text');
    expect(scenePrompt).toContain('no labels');
    expect(scenePrompt).toContain('no typography');
    expect(scenePrompt).toContain('no words');
    expect(scenePrompt).toContain('no lettering');
  });

  it('composite node layers[1] references the SVG input ref', () => {
    const match = matchTemplate(
      { goal: 'brand-mockup', inputImages: { image_0: '/logo.svg' } },
      makeRegistryWithGenerate(),
    );
    const compositeNode = match!.plan.nodes[1]!;
    const layers = compositeNode.params.layers as Array<{ input: string }>;

    expect(layers[1]!.input).toBe('$inputs.image_0');
  });

  it('composite node dependsOn includes scene', () => {
    const match = matchTemplate(
      { goal: 'brand-mockup', inputImages: { image_0: '/logo.svg' } },
      makeRegistryWithGenerate(),
    );
    const compositeNode = match!.plan.nodes[1]!;

    expect(compositeNode.dependsOn).toContain('scene');
  });

  it('returns null when inputImages is empty', () => {
    const result = matchTemplate(
      { goal: 'brand-mockup', inputImages: {} },
      makeRegistryWithGenerate(),
    );

    expect(result).toBeNull();
  });

  it('returns null when generate:openai is not registered', () => {
    const result = matchTemplate(
      { goal: 'brand-mockup', inputImages: { image_0: '/logo.svg' } },
      makeRegistry(), // makeRegistry() has no generate:openai
    );

    expect(result).toBeNull();
  });

  it('maps output_size landscape to 1792x1024 canvas and passes size param to generate', () => {
    const match = matchTemplate(
      {
        goal: 'brand-mockup',
        inputImages: { image_0: '/logo.svg' },
        constraints: { output_size: 'landscape' },
      },
      makeRegistryWithGenerate(),
    );
    const sceneNode = match!.plan.nodes[0]!;
    const compositeNode = match!.plan.nodes[1]!;

    expect(sceneNode.params.size).toBe('landscape');
    expect(compositeNode.params.canvas).toMatchObject({ width: 1792, height: 1024 });
  });

  it('emits a plan that passes PlanSchema.parse', () => {
    const match = matchTemplate(
      { goal: 'brand-mockup', inputImages: { image_0: '/logo.svg' } },
      makeRegistryWithGenerate(),
    );

    expect(() => PlanSchema.parse(match!.plan)).not.toThrow();
  });

  it('includes brand-mockup and brand_mockup in listTemplateIds()', () => {
    expect(listTemplateIds()).toContain('brand-mockup');
    expect(listTemplateIds()).toContain('brand_mockup');
  });
});
