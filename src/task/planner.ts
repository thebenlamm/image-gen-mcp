import Anthropic, {
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
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
    'Return only JSON matching the provided PlanSchema. Do not include prose outside structured output.',
    'Use only explicit refs of the form $inputs.<name> or $nodes.<id>.output.',
    'Choose only registered capabilities from this capability snapshot:',
    JSON.stringify(capabilitySnapshot, null, 2),
    'Routing policy: prefer measured quality when present, then lower cost, then lower latency, then deterministic/local providers. When you choose a provider that is the only registered provider for its op, set the corresponding routingNotes[i].rationale to include "no incumbent comparison". When no providers for an op have measured quality, set routingNotes[i].measuredQuality to false and explain that routing used cost/latency only.',
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

  let message: Awaited<ReturnType<typeof client.messages.parse>>;
  try {
    message = await client.messages.parse({
      model: options.model ?? DEFAULT_MODEL,
      max_tokens: 2048,
      temperature: 0,
      system: buildSystemPrompt(registry),
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
      output_config: { format: zodOutputFormat(PlanSchema) },
    });
  } catch (error) {
    throw mapPlannerError(error);
  }

  try {
    const plan = PlanSchema.parse(message.parsed_output);
    return {
      plan,
      reasoning: extractReasoning(message.content),
      usage: {
        promptTokens: message.usage?.input_tokens,
        completionTokens: message.usage?.output_tokens,
      },
      latencyMs: Date.now() - started,
    };
  } catch (error) {
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
