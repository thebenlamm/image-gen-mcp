import type { CapabilityOp } from '../capabilities/types.js';

export type EvalCaseStatus = 'scored' | 'skipped' | 'error';
export type EvalScorerId = 'alpha_coverage' | 'pixel_delta' | 'ocr_text_presence';

export interface EvalFixture {
  id: string;
  path: string;
  category: 'product' | 'person' | 'text-heavy' | 'transparent-edge' | 'low-contrast';
  tags: string[];
  description: string;
}

export interface EvalCase {
  id: string;
  op: CapabilityOp;
  provider: string;
  fixtureId: string;
  params: Record<string, unknown>;
  scorers: EvalScorerId[];
  requiredEnv?: string[];
}

export interface EvalScore {
  scorer: EvalScorerId;
  value?: number;
  status: EvalCaseStatus;
  reason?: string;
}

export interface EvalCaseResult {
  caseId: string;
  op: CapabilityOp;
  provider: string;
  modelVersion?: string;
  fixtureId: string;
  status: EvalCaseStatus;
  outputPath?: string;
  scores: EvalScore[];
  error?: string;
  latencyMs?: number;
}

export interface EvalRunResult {
  schemaVersion: 1;
  generatedAt: string;
  results: EvalCaseResult[];
}
