import Anthropic, {
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import { ZodError } from 'zod';
import type { CapabilityRegistry } from '../capabilities/registry.js';
import { capabilityRegistry } from '../capabilities/registry.js';
import { PlanSchema, type Plan } from './plan-schema.js';

const DEFAULT_MODEL = 'claude-haiku-4-5';

export type PlannerErrorCode =
  | 'PLANNER_AUTH'
  | 'PLANNER_TIMEOUT'
  | 'PLANNER_RATE_LIMIT'
  | 'PLANNER_PARSE'
  | 'PLANNER_INVALID_PLAN'
  | 'PLANNER_FAILURE';

export class PlannerError extends Error {
  constructor(
    public readonly code: PlannerErrorCode,
    message: string,
    public readonly retryable: boolean = false,
    public readonly suggestion?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PlannerError';
  }
}

export interface TaskConstraints {
  output_size?: 'square' | 'landscape' | 'portrait';
  output_format?: 'png';
  quality_tier?: 'fast' | 'balanced' | 'best';
  budget_cap_usd?: number;
  latency_cap_seconds?: number;
  style_refs?: string[];
}

export interface PlannerInput {
  goal: string;
  inputImages?: Record<string, string>;
  constraints?: TaskConstraints;
}

export interface PlannerOutput {
  plan: Plan;
  reasoning: string;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
  };
  latencyMs: number;
}

function buildSystemPrompt(registry: CapabilityRegistry): string {
  const capabilitySnapshot = registry.list().map((capability) => ({
    op: capability.op,
    provider: capability.provider,
    modelVersion: capability.modelVersion,
    constraints: capability.constraints,
    cost: capability.cost,
    latencyMsP50: capability.latencyMsP50,
    quality: capability.quality?.scores,
  }));

  return [
    'You are the image_task planner for an MCP image pipeline.',
    'Return only a single JSON object matching the PlanSchema. Do not include Markdown fences, prose, or comments.',
    'The top-level object must use exactly this shape: {"version":1,"goal":"...","nodes":[{"id":"node_id","op":"generate","provider":"ideogram","params":{"prompt":"..."},"dependsOn":[],"outputKind":"image","costUsd":0.08,"latencyMs":8000,"reason":"..."}],"terminalNodeId":"node_id","estimatedTotalCostUsd":0.08,"estimatedTotalLatencyMs":8000,"routingNotes":[{"nodeId":"node_id","measuredQuality":true,"rationale":"..."}]}.',
    'Do not wrap the plan in another object. Do not omit version, goal, outputKind, costUsd, latencyMs, terminalNodeId, estimatedTotalCostUsd, estimatedTotalLatencyMs, or measuredQuality.',
    'Use only explicit refs of the form $inputs.<name> or $nodes.<id>.output.',
    'Choose only registered capabilities from this capability snapshot:',
    JSON.stringify(capabilitySnapshot, null, 2),
    'For every node, set op and provider to an exact (op, provider) pair from the snapshot. Never invent providers, never leave provider blank, and never use providers from other tools.',
    'Required params by op: extract_subject uses {"input":"$inputs.<name>"}; edit_prompt uses {"input":"$inputs.<name> or $nodes.<id>.output","prompt":"..."}; generate uses {"prompt":"..."}; composite_layers uses {"canvas":{"width":1024,"height":1024},"layers":[{"input":"$inputs.<name> or $nodes.<id>.output"}]}.',
    'For output_size constraints, use params.size with one of square, landscape, portrait only when the chosen capability constraints list that size as supported.',
    'Routing policy: prefer measured quality when present, then lower cost, then lower latency, then deterministic/local providers. When you choose a provider that is the only registered provider for its op, set the corresponding routingNotes[i].rationale to include "no incumbent comparison". When no providers for an op have measured quality, set routingNotes[i].measuredQuality to false and explain that routing used cost/latency only.',
    'Each routingNotes[i].rationale must be 200 characters or fewer.',
    'Honor budget, latency, output size, and quality constraints. Set node.reason with concise per-node rationale when useful.',
  ].join('\n');
}

function buildUserPrompt(input: PlannerInput): string {
  return JSON.stringify({
    goal: input.goal,
    input_images: Object.keys(input.inputImages ?? {}),
    constraints: input.constraints ?? {},
  }, null, 2);
}

function extractReasoning(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((block): block is { type: string; text: string } =>
      Boolean(block) &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string')
    .map((block) => block.text)
    .join('\n');
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // Fall through to the consistent planner parse error below.
      }
    }
    throw new PlannerError(
      'PLANNER_PARSE',
      'Planner response did not contain valid JSON.',
      false,
      'Ensure the planner prompt returns a single JSON object.',
    );
  }
}

function mapPlannerError(error: unknown): PlannerError {
  if (error instanceof AuthenticationError) {
    return new PlannerError(
      'PLANNER_AUTH',
      'Anthropic planner authentication failed. Check ANTHROPIC_API_KEY.',
      false,
      'Set ANTHROPIC_API_KEY in your environment.',
      error,
    );
  }
  if (error instanceof RateLimitError) {
    return new PlannerError('PLANNER_RATE_LIMIT', error.message, true, 'Retry after the rate limit resets.', error);
  }
  if (
    error instanceof APIConnectionTimeoutError ||
    (error instanceof APIError && (error.status === 0 || /timeout/i.test(error.message)))
  ) {
    return new PlannerError('PLANNER_TIMEOUT', error instanceof Error ? error.message : 'Planner timed out', true, 'Retry the planner request.', error);
  }
  if (error instanceof BadRequestError) {
    return new PlannerError('PLANNER_INVALID_PLAN', error.message, false, 'Check PlanSchema and Anthropic structured-output compatibility.', error);
  }
  if (error instanceof ZodError) {
    return new PlannerError(
      'PLANNER_PARSE',
      'Plan output failed schema parsing.',
      false,
      'Plan output failed schema validation; check Anthropic SDK version compatibility.',
      error,
    );
  }
  if (error instanceof APIError) {
    return new PlannerError(
      'PLANNER_FAILURE',
      error.message,
      typeof error.status === 'number' && error.status >= 500,
      undefined,
      error,
    );
  }

  return new PlannerError('PLANNER_FAILURE', error instanceof Error ? error.message : String(error), false, undefined, error);
}

export async function planImageTask(
  input: PlannerInput,
  registry: CapabilityRegistry = capabilityRegistry,
  options: { model?: string; timeoutMs?: number } = {},
): Promise<PlannerOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new PlannerError(
      'PLANNER_AUTH',
      'ANTHROPIC_API_KEY is not set; image_task requires Anthropic Claude Haiku for planning.',
      false,
      'Set ANTHROPIC_API_KEY in your environment.',
    );
  }

  const client = new Anthropic({
    apiKey,
    timeout: options.timeoutMs ?? 30_000,
    maxRetries: 1,
  });
  const started = Date.now();

  let message: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    message = await client.messages.create({
      model: options.model ?? DEFAULT_MODEL,
      max_tokens: 2048,
      temperature: 0,
      system: buildSystemPrompt(registry),
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    });
  } catch (error) {
    throw mapPlannerError(error);
  }

  try {
    const responseText = extractReasoning(message.content);
    const plan = PlanSchema.parse(extractJsonObject(responseText));
    return {
      plan,
      reasoning: '',
      usage: {
        promptTokens: message.usage?.input_tokens,
        completionTokens: message.usage?.output_tokens,
      },
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    if (error instanceof PlannerError) {
      throw error;
    }
    if (error instanceof ZodError) {
      throw new PlannerError(
        'PLANNER_INVALID_PLAN',
        'Anthropic returned a parsed plan that failed defensive PlanSchema validation.',
        false,
        JSON.stringify(error.issues),
        error,
      );
    }
    throw mapPlannerError(error);
  }
}
