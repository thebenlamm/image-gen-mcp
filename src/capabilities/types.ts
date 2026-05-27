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
  /** Required when registered with allowUnscoredProduction=true. Audit trail. */
  unscoredJustification?: string;
}

export interface CapabilityRegistrationOptions {
  allowUnscoredProduction?: boolean;
}

export interface CapabilityCost {
  perCallUsd?: number;
  perMegapixelUsd?: number;
}

export interface AnalyzeDimensionsResult {
  type: 'dimensions';
  width: number;
  height: number;
  format: string;
  channels: number;
  hasAlpha: boolean;
}

export interface AnalyzePaletteResult {
  type: 'palette';
  colors: Array<{ hex: string; r: number; g: number; b: number; weight: number }>;
}

export interface AnalyzeOcrResult {
  type: 'ocr';
  text: string;
  confidence: number;
  words?: Array<{ text: string; confidence: number; bbox: [number, number, number, number] }>;
}

export interface CapabilityInvokeParams {
  params: Record<string, unknown>;
  outputPath?: string;
  outputDir?: string;
  /** Reserved for Phase 9 DAG retry logic. No code reads it in Phase 8. */
  idempotencyKey?: string;
}

/**
 * Capability invocation result. Discriminated on `kind`:
 *  - 'image' -> buffer is the resulting PNG; image_op saves via resolveOutputPath/saveImage.
 *  - 'data'  -> structured analysis result; image_op skips save (no outputPath/outputDir consumption).
 *
 * `metadata` is for INVOCATION TELEMETRY ONLY (input path, model params, timing,
 * predictionId, etc.). Do NOT place structured result data in `metadata` -- that
 * lives in the typed `data` field for `kind: 'data'` results.
 */
export type CapabilityInvokeResult =
  | {
      kind: 'image';
      buffer: Buffer;
      model: string;
      revisedPrompt?: string;
      /** Invocation telemetry only -- NOT result data. */
      metadata?: Record<string, unknown>;
    }
  | {
      kind: 'data';
      data: AnalyzeDimensionsResult | AnalyzePaletteResult | AnalyzeOcrResult;
      model: string;
      /** Invocation telemetry only -- NOT result data. */
      metadata?: Record<string, unknown>;
    };

export type CapabilityInvokeErrorCode =
  | 'INPUT_TOO_LARGE'
  | 'CONSTRAINT_VIOLATION'
  | 'PROVIDER_FAILURE'
  | 'TIMEOUT'
  | 'UNSUPPORTED';

export class CapabilityInvokeError extends Error {
  constructor(
    public readonly code: CapabilityInvokeErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly suggestion?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CapabilityInvokeError';
  }
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

// ProcessingOperation rehoming (D-11): single canonical home is src/utils/processing.ts;
// re-exported here so capability files can import from './types.js' without crossing layers.
export type { ProcessingOperation } from '../utils/processing.js';
