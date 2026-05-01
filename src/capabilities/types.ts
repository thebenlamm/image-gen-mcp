export type CapabilityOp =
  | 'extract_subject'
  | 'edit_prompt'
  | 'composite_layers'
  | 'transform'
  | 'enhance_upscale'
  | 'analyze_dimensions'
  | 'analyze_palette'
  | 'analyze_ocr'
  | 'generate';

export interface CapabilityConstraints {
  maxPromptLength?: number;
  supportedSizes?: Array<'square' | 'landscape' | 'portrait'>;
  requiresInputImage?: boolean;
  supportsMultipleInputs?: boolean;
  outputFormat?: 'png';
}

export interface CapabilityQuality {
  scores?: Record<string, number>;
  evaluatedAt?: string;
  evalResultPath?: string;
}

export interface CapabilityCost {
  perCallUsd?: number;
  perMegapixelUsd?: number;
}

export interface CapabilityInvokeParams {
  params: Record<string, unknown>;
  outputPath?: string;
  outputDir?: string;
}

export interface CapabilityInvokeResult {
  buffer: Buffer;
  model: string;
  revisedPrompt?: string;
  metadata?: Record<string, unknown>;
}

export type CapabilityInvoke = (
  input: CapabilityInvokeParams
) => Promise<CapabilityInvokeResult>;

export interface Capability {
  op: CapabilityOp;
  provider: string;
  modelVersion: string;
  constraints: CapabilityConstraints;
  cost: CapabilityCost;
  latencyMsP50?: number;
  quality?: CapabilityQuality;
  invoke: CapabilityInvoke;
}

export type CapabilityKey = `${CapabilityOp}:${string}`;
