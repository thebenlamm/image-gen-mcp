import { capabilityRegistry } from '../capabilities/registry.js';
import type { CapabilityRegistry } from '../capabilities/registry.js';
import { ASSET_PRESETS, type AssetType } from '../utils/presets.js';
import { PlanSchema, type Plan, type PlanNode } from './plan-schema.js';
import type { PlannerInput } from './planner.js';

export interface TemplateMatch {
  templateId: string;
  plan: Plan;
}

type TemplateBuilder = (input: PlannerInput) => Plan | null;

function normalizeGoal(goal: string): string {
  return goal.trim().toLowerCase().replace(/\s+/g, '_');
}

function firstInputRef(input: PlannerInput): string | null {
  const inputKeys = Object.keys(input.inputImages ?? {});
  if (inputKeys.length === 0) return null;
  return `$inputs.${inputKeys[0]}`;
}

function buildAssetPresetTemplate(assetType: AssetType): TemplateBuilder {
  return (input) => {
    const inputRef = firstInputRef(input);
    if (!inputRef) return null;

    const preset = ASSET_PRESETS[assetType];
    const transformNode: PlanNode = {
      id: 'transform',
      op: 'transform',
      provider: 'sharp',
      params: {
        input: inputRef,
        operations: preset.operations,
      },
      dependsOn: [],
      outputKind: 'image',
      costUsd: 0,
      latencyMs: 200,
      reason: `template:${assetType}`,
    };

    return {
      version: 1,
      goal: input.goal,
      nodes: [transformNode],
      terminalNodeId: 'transform',
      estimatedTotalCostUsd: 0,
      estimatedTotalLatencyMs: 200,
    };
  };
}

const productOnWhite: TemplateBuilder = (input) => {
  const inputRef = firstInputRef(input);
  if (!inputRef) return null;

  const canvasBySize = {
    square: { width: 2000, height: 2000 },
    landscape: { width: 2000, height: 1125 },
    portrait: { width: 1125, height: 2000 },
  } as const;
  const canvas = canvasBySize[input.constraints?.output_size ?? 'square'];
  const nodes: PlanNode[] = [
    {
      id: 'extract',
      op: 'extract_subject',
      provider: '@imgly/local',
      params: { input: inputRef },
      dependsOn: [],
      outputKind: 'image',
      costUsd: 0,
      latencyMs: 1500,
      reason: 'template:product-on-white extract subject',
    },
    {
      id: 'compose',
      op: 'composite_layers',
      provider: 'sharp',
      params: {
        canvas: { ...canvas, background: { r: 255, g: 255, b: 255, alpha: 1 } },
        layers: [{ input: '$nodes.extract.output', anchor: 'center', x: canvas.width / 2, y: canvas.height / 2 }],
      },
      dependsOn: ['extract'],
      outputKind: 'image',
      costUsd: 0,
      latencyMs: 300,
      reason: 'template:product-on-white compose on white',
    },
    {
      id: 'transform',
      op: 'transform',
      provider: 'sharp',
      params: {
        input: '$nodes.compose.output',
        operations: [],
      },
      dependsOn: ['compose'],
      outputKind: 'image',
      costUsd: 0,
      latencyMs: 200,
      reason: 'template:product-on-white finalize',
    },
  ];

  return {
    version: 1,
    goal: input.goal,
    nodes,
    terminalNodeId: 'transform',
    estimatedTotalCostUsd: 0,
    estimatedTotalLatencyMs: 2000,
  };
};

const logoCleanup: TemplateBuilder = (input) => {
  const inputRef = firstInputRef(input);
  if (!inputRef) return null;

  return {
    version: 1,
    goal: input.goal,
    nodes: [{
      id: 'extract',
      op: 'extract_subject',
      provider: '@imgly/local',
      params: { input: inputRef },
      dependsOn: [],
      outputKind: 'image',
      costUsd: 0,
      latencyMs: 1500,
      reason: 'template:logo-cleanup',
    }],
    terminalNodeId: 'extract',
    estimatedTotalCostUsd: 0,
    estimatedTotalLatencyMs: 1500,
  };
};

const upscaleExport: TemplateBuilder = (input) => {
  const inputRef = firstInputRef(input);
  if (!inputRef) return null;

  return {
    version: 1,
    goal: input.goal,
    nodes: [{
      id: 'upscale',
      op: 'enhance_upscale',
      provider: 'replicate',
      params: { input: inputRef },
      dependsOn: [],
      outputKind: 'image',
      costUsd: 0.005,
      latencyMs: 8000,
      reason: 'template:upscale-export',
    }],
    terminalNodeId: 'upscale',
    estimatedTotalCostUsd: 0.005,
    estimatedTotalLatencyMs: 8000,
  };
};

const brandMockup: TemplateBuilder = (input) => {
  const svgRef = firstInputRef(input);
  if (!svgRef) return null;

  const canvasBySize = {
    square: { width: 1024, height: 1024 },
    landscape: { width: 1792, height: 1024 },
    portrait: { width: 1024, height: 1792 },
  } as const;
  const canvas = canvasBySize[input.constraints?.output_size ?? 'square'];

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

const TEMPLATE_BUILDERS: Record<string, TemplateBuilder> = {
  ...Object.fromEntries(
    (Object.keys(ASSET_PRESETS) as AssetType[]).map(
      (assetType) => [assetType, buildAssetPresetTemplate(assetType)] as const,
    ),
  ),
  'product-on-white': productOnWhite,
  product_on_white: productOnWhite,
  'logo-cleanup': logoCleanup,
  logo_cleanup: logoCleanup,
  'upscale-export': upscaleExport,
  upscale_export: upscaleExport,
  'brand-mockup': brandMockup,
  brand_mockup: brandMockup,
};

export function matchTemplate(
  input: PlannerInput,
  registry: Pick<CapabilityRegistry, 'get'> = capabilityRegistry,
): TemplateMatch | null {
  const key = normalizeGoal(input.goal);
  const builder = TEMPLATE_BUILDERS[key];
  if (!builder) return null;

  const plan = builder(input);
  if (!plan) return null;

  for (const node of plan.nodes) {
    if (!registry.get(node.op, node.provider)) return null;
  }

  const parsed = PlanSchema.safeParse(plan);
  if (!parsed.success) return null;

  return { templateId: key, plan: parsed.data };
}

export function listTemplateIds(): string[] {
  return Object.keys(TEMPLATE_BUILDERS);
}
