#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { pathToFileURL } from 'node:url';
import express from 'express';

import {
  CapabilityInvokeError,
  capabilityRegistry,
  registerBuiltInCapabilities,
  type CapabilityOp,
} from './capabilities/index.js';
import { validateCapabilityParams } from './capabilities/validation.js';
import {
  createRunId,
  resolveRunDir,
  nodeArtifactPath,
  writeFileAtomic,
  writeManifest,
  buildTraceNode,
  parseRetentionHours,
  sweepRunArtifacts,
  type RunManifest,
} from './runs/index.js';
import { registry, type ProviderName, type ImageProvider } from './providers/index.js';
import { createOpenAIProvider } from './providers/openai.js';
import { createGeminiProvider } from './providers/gemini.js';
import { createReplicateProvider } from './providers/replicate.js';
import { createTogetherProvider } from './providers/together.js';
import { createGrokProvider } from './providers/grok.js';
import { resolveOutputPath, saveImage } from './utils/image.js';
import { applyOperations, getImageInfo, type ProcessingOperation } from './utils/processing.js';
import { getPreset, ASSET_PRESETS, type AssetType } from './utils/presets.js';
import {
  checkBudgetGate,
  executeDag,
  planImageTask,
  PlannerError,
  validatePlan,
  type ExecResult,
  type Plan,
  type TaskConstraints,
} from './task/index.js';
import { ResponseGuardError, serializeImageTaskResponse } from './task/serialize-response.js';
import { matchTemplate } from './task/templates.js';

// Register available providers
const providers = [
  createOpenAIProvider(),
  createGeminiProvider(),
  createReplicateProvider(),
  createTogetherProvider(),
  createGrokProvider(),
].filter((p): p is NonNullable<typeof p> => p !== null);

for (const provider of providers) {
  registry.register(provider);
}

registerBuiltInCapabilities();

const VALID_PROVIDERS: ProviderName[] = ['openai', 'gemini', 'replicate', 'together', 'grok'];

function resolveDefaultProvider(): ProviderName {
  const envValue = process.env.IMAGE_GEN_DEFAULT_PROVIDER?.trim();
  if (envValue) {
    if (VALID_PROVIDERS.includes(envValue as ProviderName)) {
      return envValue as ProviderName;
    }
    const available = registry.getAvailable();
    // If no providers available, main() exits before tools are called — 'grok' is a safe static fallback
    const fallback = available[0] || 'grok';
    console.error(`Warning: IMAGE_GEN_DEFAULT_PROVIDER='${envValue}' is not a valid provider. Valid: ${VALID_PROVIDERS.join(', ')}. Falling back to '${fallback}'.`);
    return fallback;
  }
  return 'grok';
}

const DEFAULT_PROVIDER = resolveDefaultProvider();

// Shared helpers for generate_image and generate_asset
function resolveProvider(
  requested: ProviderName | undefined,
  needsSize: boolean,
): { provider: ImageProvider; providerName: ProviderName; sizeDropped?: boolean } | { error: string; providerName: ProviderName } {
  let providerName = requested || DEFAULT_PROVIDER;
  let provider = registry.get(providerName);

  // Only auto-fallback to a size-capable provider when no explicit provider was requested
  if (provider && needsSize && !provider.supportsSize) {
    if (!requested) {
      const sizeCapable = registry.getSizeCapable();
      if (sizeCapable.length > 0) {
        providerName = sizeCapable[0];
        provider = registry.get(providerName);
      }
    } else {
      // User explicitly chose this provider — proceed without size rather than silently switching
      return { provider, providerName, sizeDropped: true };
    }
  }

  if (!provider) {
    const available = registry.getAvailable();
    return {
      providerName,
      error: `Provider '${providerName}' is not available. Available providers: ${available.join(', ')}`,
    };
  }

  return { provider, providerName };
}

function buildEffectivePrompt(prompt: string, style?: string): string {
  return style ? `${style}, ${prompt}` : prompt;
}

// Factory: creates a fully configured McpServer instance.
// Each SSE client needs its own McpServer, so tool registration is in here.
export function createServer(): McpServer {
  const server = new McpServer({
    name: 'image-gen',
    version: '1.0.0',
  });

  registerTools(server);
  return server;
}

function registerTools(server: McpServer): void {

// Define the generate_image tool
server.tool(
  'generate_image',
  'Generate an image from a text prompt using various AI providers. Supports style modifiers (e.g., "watercolor painting"), size presets (square/landscape/portrait), and custom output paths. Providers: OpenAI, Gemini, Replicate, Together AI, Grok.',
  {
    prompt: z.string().describe('The text description of the image to generate'),
    provider: z
      .enum(['openai', 'gemini', 'replicate', 'together', 'grok'])
      .optional()
      .describe('The image generation provider to use'),
    model: z.string().optional().describe('Provider-specific model to use'),
    size: z
      .enum(['square', 'landscape', 'portrait'])
      .optional()
      .describe('Image size/aspect ratio'),
    outputPath: z.string().optional().describe('Exact output file path (must end in .png)'),
    outputDir: z.string().optional().describe('Output directory (filename auto-generated)'),
    style: z.string().optional().describe('Style modifier prepended to the generation prompt (e.g., "watercolor painting", "pixel art", "photorealistic")'),
  },
  async ({ prompt, provider, model, size, outputPath, outputDir, style }) => {
    const resolved = resolveProvider(provider, !!size);
    if ('error' in resolved) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: false, error: resolved.error }),
        }],
      };
    }
    const imageProvider = resolved.provider;
    const providerName = resolved.providerName;
    const effectiveSize = resolved.sizeDropped ? undefined : size;

    try {
      const effectivePrompt = buildEffectivePrompt(prompt, style);

      const result = await imageProvider.generate({
        prompt: effectivePrompt,
        model,
        size: effectiveSize,
      });

      const filePath = await resolveOutputPath({
        outputPath,
        outputDir,
        prompt,
        provider: providerName,
      });
      await saveImage(result.buffer, filePath);

      const response: Record<string, unknown> = {
        success: true,
        path: filePath,
        provider: providerName,
        model: result.model,
        revisedPrompt: result.revisedPrompt,
      };
      if (resolved.sizeDropped) {
        response.warning = `Provider '${providerName}' does not support size parameter; size was ignored.`;
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: message,
              provider: providerName,
              availableProviders: registry.getAvailable(),
            }),
          },
        ],
      };
    }
  }
);

// Define the process_image tool
server.tool(
  'process_image',
  'Process an existing image with resize, crop, aspect crop, and circle mask operations. Operations execute in the order specified.',
  {
    inputPath: z.string().describe('Path to the input image file'),
    operations: z.array(z.union([
      z.object({
        type: z.literal('resize'),
        width: z.number().int().positive().optional().describe('Target width in pixels'),
        height: z.number().int().positive().optional().describe('Target height in pixels'),
        fit: z.enum(['cover', 'contain', 'fill']).optional().describe('How to fit image to dimensions (default: cover)'),
        withoutEnlargement: z.boolean().optional().describe('Prevent upscaling beyond source dimensions'),
      }),
      z.object({
        type: z.literal('crop'),
        x: z.number().int().nonnegative().describe('Left offset in pixels'),
        y: z.number().int().nonnegative().describe('Top offset in pixels'),
        width: z.number().int().positive().describe('Crop width in pixels'),
        height: z.number().int().positive().describe('Crop height in pixels'),
      }),
      z.object({
        type: z.literal('aspectCrop'),
        ratio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).describe('Target aspect ratio'),
        gravity: z.enum(['center', 'north', 'south', 'east', 'west']).optional().describe('Crop anchor position (default: center)'),
      }),
      z.object({
        type: z.literal('circleMask'),
      }),
    ])).describe('Array of processing operations to apply in order'),
    outputPath: z.string().optional().describe('Output file path (must end in .png). Defaults to input path with _processed suffix'),
  },
  async ({ inputPath, operations, outputPath }) => {
    try {
      // Read input file
      const inputBuffer = await fs.promises.readFile(inputPath);

      // Apply operations
      const result = await applyOperations(inputBuffer, operations as ProcessingOperation[]);

      // Determine output path — handles any input extension (not just .png)
      let finalOutputPath: string;
      if (outputPath) {
        finalOutputPath = outputPath;
      } else {
        const parsed = path.parse(inputPath);
        finalOutputPath = path.join(parsed.dir, `${parsed.name}_processed.png`);
      }
      if (!finalOutputPath.toLowerCase().endsWith('.png')) {
        throw new Error('Output path must end with .png');
      }

      // Ensure output directory exists
      await fs.promises.mkdir(path.dirname(finalOutputPath), { recursive: true });

      // Save result (atomic write)
      await saveImage(result.buffer, finalOutputPath);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            inputPath,
            outputPath: finalOutputPath,
            originalSize: { width: result.originalInfo.width, height: result.originalInfo.height },
            outputSize: { width: result.outputInfo.width, height: result.outputInfo.height },
            operationsApplied: result.operationsApplied,
          }),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: message,
            inputPath,
          }),
        }],
      };
    }
  }
);

// Define the generate_asset tool
server.tool(
  'generate_asset',
  'Generate a ready-to-use image asset with automatic post-processing. Combines generation and processing in one call. Asset types: profile_pic (200x200 circular), post_image (1200x675 16:9), hero_photo (1080x1920 9:16), avatar (80x80 circular), scene (1200x675 16:9). Avery label presets: avery_8293 (1.5" round sticker, 450x450 circular), avery_5160 (address label, 788x300), avery_22830 (2.5" round sticker, 750x750 circular), avery_8164 (shipping label, 1000x1200). Supports style modifiers and custom output paths.',
  {
    prompt: z.string().describe('Text description of the image to generate'),
    assetType: z
      .enum(['profile_pic', 'post_image', 'hero_photo', 'avatar', 'scene', 'avery_8293', 'avery_5160', 'avery_22830', 'avery_8164'])
      .describe('Type of asset to generate. profile_pic: 200x200 circular. post_image: 1200x675 16:9. hero_photo: 1080x1920 9:16. avatar: 80x80 circular. scene: 1200x675 16:9. avery_8293: 1.5" round sticker (450x450 circular). avery_5160: address label (788x300). avery_22830: 2.5" round sticker (750x750 circular). avery_8164: shipping label (1000x1200).'),
    provider: z
      .enum(['openai', 'gemini', 'replicate', 'together', 'grok'])
      .optional()
      .describe('Image generation provider to use'),
    model: z.string().optional().describe('Provider-specific model to use'),
    style: z.string().optional().describe('Style modifier prepended to generation prompt'),
    assetId: z.string().optional().describe('Asset identifier for clean filename (e.g., "my-avatar" produces my-avatar.png). Omit for default date/hash naming.'),
    outputPath: z.string().optional().describe('Exact output file path (must end in .png)'),
    outputDir: z.string().optional().describe('Output directory'),
  },
  async ({ prompt, assetType, provider, model, style, assetId, outputPath, outputDir }) => {
    // Look up preset
    const preset = getPreset(assetType as AssetType);
    if (!preset) {
      const validTypes = Object.keys(ASSET_PRESETS).join(', ');
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: `Unknown asset type '${assetType}'. Valid types: ${validTypes}`,
          }),
        }],
      };
    }

    // Resolve provider
    const resolved = resolveProvider(provider, !!preset.generationSize);
    if ('error' in resolved) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: false, error: resolved.error, assetType }),
        }],
      };
    }
    const imageProvider = resolved.provider;
    const providerName = resolved.providerName;
    const effectiveGenSize = resolved.sizeDropped ? undefined : preset.generationSize;

    try {
      const effectivePrompt = buildEffectivePrompt(prompt, style);

      // Generate image with preset's generation size
      const result = await imageProvider.generate({
        prompt: effectivePrompt,
        model,
        size: effectiveGenSize,
      });

      // Apply post-processing operations with raw fallback
      let processed: Awaited<ReturnType<typeof applyOperations>>;
      try {
        processed = await applyOperations(result.buffer, preset.operations);
      } catch (processingError) {
        // Save raw image as fallback
        const rawInfo = await getImageInfo(result.buffer);
        const rawFilePath = await resolveOutputPath({
          outputPath,
          outputDir,
          assetId: assetId ? `${assetId}_raw` : undefined,
          prompt,
          provider: providerName,
        });
        await saveImage(result.buffer, rawFilePath);

        const processingMessage = processingError instanceof Error ? processingError.message : String(processingError);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              path: rawFilePath,
              provider: providerName,
              model: result.model,
              assetType,
              outputSize: { width: rawInfo.width, height: rawInfo.height },
              warning: `Post-processing failed, saved raw image: ${processingMessage}`,
            }),
          }],
        };
      }

      // Resolve output path with assetId support
      const filePath = await resolveOutputPath({
        outputPath,
        outputDir,
        assetId,
        prompt,
        provider: providerName,
      });

      // Save processed image
      await saveImage(processed.buffer, filePath);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              path: filePath,
              provider: providerName,
              model: result.model,
              assetType,
              outputSize: { width: processed.outputInfo.width, height: processed.outputInfo.height },
              operationsApplied: processed.operationsApplied,
            }),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: message,
              provider: providerName,
              assetType,
            }),
          },
        ],
      };
    }
  }
);

server.tool(
  'image_op',
  'Invoke a registered image capability directly by operation and provider. Image-returning ops (extract_subject, edit_prompt, transform, composite_layers, enhance_upscale, generate) save PNG output through standard output path rules and return {success, output, runId, trace}. Data-returning ops (analyze_dimensions, analyze_palette, analyze_ocr) ignore outputPath/outputDir and return {success, data, runId, trace}. Use list_capabilities to discover registered (op, provider) pairs.',
  {
    op: z
      .enum(['extract_subject', 'edit_prompt', 'composite_layers', 'transform', 'enhance_upscale', 'analyze_dimensions', 'analyze_palette', 'analyze_ocr', 'generate'])
      .describe('Capability operation. Use list_capabilities to see currently-registered ops.'),
    provider: z
      .string()
      .describe('Capability provider (e.g., @imgly/local, openai, sharp, replicate, tesseract).'),
    params: z
      .record(z.unknown())
      .default({})
      .describe('Operation parameters. See list_capabilities and per-cap docs for required shape.'),
    outputPath: z.string().optional().describe('Exact output file path (must end in .png). IGNORED for analyze_* ops.'),
    outputDir: z.string().optional().describe('Output directory (filename auto-generated). IGNORED for analyze_* ops.'),
  },
  handleImageOp,
);

server.tool(
  'image_task',
  'Hand off a natural-language image goal and receive a final image plus structured trace. The MCP plans a DAG of capability invocations using Anthropic Claude Haiku, validates it against the registry (budget cap, latency cap, capability params, IMAGE_GEN_INPUT_ROOT path policy), executes it, and returns {output: {path}, runId, total_cost_usd, total_latency_ms, plan, trace}. Use dry_run: true to preview the validated plan without executing. Trace returns filesystem paths only - never base64 image data. Requires ANTHROPIC_API_KEY.',
  {
    goal: z.string().min(1).describe('Natural-language description of the desired image outcome.'),
    input_images: z.array(z.string()).optional().describe('Absolute paths to input images. When IMAGE_GEN_INPUT_ROOT is set, paths must resolve under that root.'),
    constraints: z.object({
      output_size: z.enum(['square', 'landscape', 'portrait']).optional(),
      output_format: z.enum(['png']).optional(),
      quality_tier: z.enum(['fast', 'balanced', 'best']).optional(),
      budget_cap_usd: z.number().positive().optional().describe('Hard plan-time gate. If estimated cost exceeds this, fail before any provider call.'),
      latency_cap_seconds: z.number().positive().optional(),
      style_refs: z.array(z.string()).optional(),
    }).optional(),
    dry_run: z.boolean().optional().describe('When true, return the validated plan and estimated totals without invoking any provider.'),
    runId: z.string().optional().describe('Reuse an existing runId; otherwise auto-generated.'),
    seed: z.number().optional().describe('Optional planner seed for reproducible plan choice.'),
    outputDir: z.string().optional(),
    outputPath: z.string().optional(),
  },
  handleImageTask,
);

server.tool(
  'list_capabilities',
  'List all registered capabilities (op, provider, modelVersion, constraints, cost, latencyMsP50, quality). Use this before calling image_op to discover available routes and pick a provider by cost or quality. The Phase 9 planner consumes this to make routing decisions.',
  {},
  handleListCapabilities,
);

} // end registerTools

export interface ImageOpArgs {
  op: string;
  provider: string;
  params: Record<string, unknown>;
  outputPath?: string;
  outputDir?: string;
}

export interface ImageTaskArgs {
  goal: string;
  input_images?: string[];
  constraints?: TaskConstraints;
  dry_run?: boolean;
  runId?: string;
  seed?: number;
  outputDir?: string;
  outputPath?: string;
}

export async function handleListCapabilities(): Promise<{
  content: Array<{ type: 'text'; text: string }>;
}> {
  const caps = capabilityRegistry.list().map((capability) => ({
    op: capability.op,
    provider: capability.provider,
    modelVersion: capability.modelVersion,
    constraints: capability.constraints,
    cost: capability.cost,
    ...(capability.latencyMsP50 !== undefined
      ? { latencyMsP50: capability.latencyMsP50 }
      : {}),
    ...(capability.quality !== undefined ? { quality: capability.quality } : {}),
  }));

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ capabilities: caps }),
    }],
  };
}

function imageOpErrorResponse(
  runId: string,
  error: string | { message: string; code?: string; retryable?: boolean; suggestion?: string },
  nodes: ReturnType<typeof buildTraceNode>[] = [],
  extra: Record<string, unknown> = {},
): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: false,
        error: typeof error === 'string' ? { message: error } : error,
        runId,
        trace: { runId, nodes },
        ...extra,
      }),
    }],
  };
}

export async function handleImageOp(args: ImageOpArgs): Promise<{
  content: Array<{ type: 'text'; text: string }>;
}> {
  const { op, provider, params, outputPath, outputDir } = args;
  const startedAt = Date.now();
  const runId = createRunId();
  let runDir: string;

  try {
    runDir = await resolveRunDir(runId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return imageOpErrorResponse(runId, `Failed to create run directory: ${message}`);
  }

  const baseInvocation: RunManifest['invocation'] = {
    tool: 'image_op',
    op,
    provider,
    params,
    outputPath,
    outputDir,
  };

  try {
    await writeManifest(runDir, {
      schemaVersion: 1,
      runId,
      startedAt: new Date(startedAt).toISOString(),
      status: 'in_progress',
      invocation: baseInvocation,
      nodes: [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return imageOpErrorResponse(runId, `Failed to write run manifest: ${message}`);
  }

  const capability = capabilityRegistry.get(op as CapabilityOp, provider);
  if (!capability) {
    const endedAt = Date.now();
    const error = `Capability not registered for op '${op}' and provider '${provider}'`;
    const errorNode = buildTraceNode({
      id: 'n1',
      op,
      provider,
      startedAtMs: startedAt,
      endedAtMs: endedAt,
      outcome: 'error',
      error,
    });

    try {
      await writeManifest(runDir, {
        schemaVersion: 1,
        runId,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        status: 'error',
        invocation: baseInvocation,
        nodes: [{
          id: errorNode.id,
          op,
          provider,
          outcome: 'error',
          error,
          durationMs: errorNode.durationMs,
        }],
        totalDurationMs: errorNode.durationMs,
        error,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return imageOpErrorResponse(
        runId,
        error,
        [errorNode],
        {
          available: capabilityRegistry.list(op as CapabilityOp).map((c) => c.provider),
          manifestError: `Failed to write run manifest: ${message}`,
        },
      );
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: false,
          error: { message: error },
          available: capabilityRegistry.list(op as CapabilityOp).map((c) => c.provider),
          runId,
          trace: { runId, nodes: [errorNode] },
        }),
      }],
    };
  }

  const nodeId = '1';
  const artifactPath = nodeArtifactPath(runDir, nodeId);

  try {
    validateCapabilityParams(capability, params);
    const nodeStartedAt = Date.now();
    const result = await capability.invoke({ params, outputPath, outputDir });
    const nodeEndedAt = Date.now();

    if (result.kind === 'image') {
      await writeFileAtomic(artifactPath, result.buffer);

      const filePath = await resolveOutputPath({
        outputPath,
        outputDir,
        prompt: `${op}-${provider}`,
        provider,
      });
      await saveImage(result.buffer, filePath);

      const node = buildTraceNode({
        id: `n${nodeId}`,
        op,
        provider,
        model: result.model,
        artifactPath,
        output: filePath,
        startedAtMs: nodeStartedAt,
        endedAtMs: nodeEndedAt,
        outcome: 'success',
        revisedPrompt: result.revisedPrompt,
        metadata: result.metadata,
      });

      const endedAt = Date.now();
      await writeManifest(runDir, {
        schemaVersion: 1,
        runId,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        status: 'success',
        invocation: baseInvocation,
        nodes: [{
          id: node.id,
          op,
          provider,
          model: result.model,
          artifactPath,
          durationMs: node.durationMs,
          outcome: 'success',
        }],
        finalOutput: filePath,
        totalDurationMs: endedAt - startedAt,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            output: filePath,
            runId,
            trace: { runId, nodes: [node] },
          }),
        }],
      };
    }

    if (result.kind === 'data') {
      const dataNode = buildTraceNode({
        id: `n${nodeId}`,
        op,
        provider,
        model: result.model,
        startedAtMs: nodeStartedAt,
        endedAtMs: nodeEndedAt,
        outcome: 'success',
        metadata: result.metadata,
      });

      const dataEndedAt = Date.now();
      await writeManifest(runDir, {
        schemaVersion: 1,
        runId,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(dataEndedAt).toISOString(),
        status: 'success',
        invocation: baseInvocation,
        nodes: [{
          id: dataNode.id,
          op,
          provider,
          model: result.model,
          durationMs: dataNode.durationMs,
          outcome: 'success',
        }],
        totalDurationMs: dataEndedAt - startedAt,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            data: result.data,
            runId,
            trace: { runId, nodes: [dataNode] },
          }),
        }],
      };
    }

    throw new Error(`Unsupported capability result kind: ${(result as { kind?: string }).kind}`);
  } catch (error) {
    const endedAt = Date.now();
    const message = error instanceof Error ? error.message : String(error);
    const errorPayload =
      error instanceof CapabilityInvokeError
        ? {
            message,
            code: error.code,
            retryable: error.retryable,
            suggestion: error.suggestion,
          }
        : { message };
    const errorNode = buildTraceNode({
      id: `n${nodeId}`,
      op,
      provider,
      startedAtMs: startedAt,
      endedAtMs: endedAt,
      outcome: 'error',
      error: message,
    });

    try {
      await writeManifest(runDir, {
        schemaVersion: 1,
        runId,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        status: 'error',
        invocation: baseInvocation,
        nodes: [{
          id: errorNode.id,
          op,
          provider,
          outcome: 'error',
          error: message,
          durationMs: errorNode.durationMs,
        }],
        totalDurationMs: errorNode.durationMs,
        error: message,
      });
    } catch (err) {
      const manifestMessage = err instanceof Error ? err.message : String(err);
      return imageOpErrorResponse(
        runId,
        message,
        [errorNode],
        { manifestError: `Failed to write run manifest: ${manifestMessage}` },
      );
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: false,
          error: errorPayload,
          runId,
          trace: { runId, nodes: [errorNode] },
        }),
      }],
    };
  }
}

function imageTaskErrorResponse(
  runId: string,
  error: string | { message: string; code?: string; retryable?: boolean; suggestion?: string; estimated_cost_usd?: number; cap_usd?: number; budget_cap_usd?: number; threshold_usd?: number },
  extra: Record<string, unknown> = {},
): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: false,
        error: typeof error === 'string' ? { message: error } : error,
        runId,
        trace: [],
        ...extra,
      }),
    }],
  };
}

function imageTaskPlannerErrorResponse(runId: string, err: unknown): { content: Array<{ type: 'text'; text: string }> } {
  if (err instanceof PlannerError) {
    return imageTaskErrorResponse(runId, {
      message: err.message,
      code: err.code,
      retryable: err.retryable,
      suggestion: err.suggestion,
    });
  }
  return imageTaskErrorResponse(runId, err instanceof Error ? err.message : String(err));
}

function imageTaskValidationErrorResponse(
  runId: string,
  failure: Exclude<Awaited<ReturnType<typeof validatePlan>>, { ok: true }>,
): { content: Array<{ type: 'text'; text: string }> } {
  const first = failure.errors[0];
  return imageTaskErrorResponse(runId, {
    message: first?.message ?? 'Plan validation failed',
    code: first?.code,
    suggestion: first?.suggestion,
    ...(failure.estimated_cost_usd !== undefined ? { estimated_cost_usd: Number(failure.estimated_cost_usd.toFixed(6)) } : {}),
    ...(failure.budget_cap_usd !== undefined ? { cap_usd: failure.budget_cap_usd } : {}),
  });
}

function inputImagesByRef(inputImages: string[] | undefined): Record<string, string> {
  return Object.fromEntries((inputImages ?? []).map((imagePath, index) => [`image_${index}`, imagePath]));
}

function dryRunResponse(
  plan: Plan,
  runId: string,
  plannerMethod: 'llm' | 'template',
): { content: Array<{ type: 'text'; text: string }> } {
  const response = serializeImageTaskResponse({
    plan,
    dagResult: {
      nodeOutputs: {},
      trace: { runId, nodes: [], skips: [] },
      totals: { cost_usd: plan.estimatedTotalCostUsd, latency_ms: plan.estimatedTotalLatencyMs, success: 0, failure: 0, skipped: 0 },
      bestPartial: null,
    },
    runId,
    plannerMethod,
  });
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        ...response,
        dry_run: true,
        total_cost_usd: plan.estimatedTotalCostUsd,
        total_latency_ms: plan.estimatedTotalLatencyMs,
      }),
    }],
  };
}

async function saveTerminalOutput(args: {
  dagResult: ExecResult;
  plan: Plan;
  outputPath?: string;
  outputDir?: string;
  goal: string;
}): Promise<void> {
  const terminal = args.dagResult.nodeOutputs[args.plan.terminalNodeId];
  if (terminal?.kind !== 'image') return;

  const finalPath = await resolveOutputPath({
    outputPath: args.outputPath,
    outputDir: args.outputDir,
    prompt: args.goal,
    provider: 'image_task',
  });
  const buffer = await fs.promises.readFile(terminal.artifactPath);
  await saveImage(buffer, finalPath);
  terminal.artifactPath = finalPath;

  const terminalTrace = args.dagResult.trace.nodes.find((node) => node.id === `n${args.plan.terminalNodeId}`);
  if (terminalTrace) {
    terminalTrace.output = finalPath;
  }
}

export async function handleImageTask(args: ImageTaskArgs): Promise<{
  content: Array<{ type: 'text'; text: string }>;
}> {
  const startedAt = Date.now();
  const runId = args.runId ?? createRunId();
  let runDir: string;

  try {
    runDir = await resolveRunDir(runId);
  } catch (err) {
    return imageTaskErrorResponse(runId, `Failed to create run directory: ${err instanceof Error ? err.message : String(err)}`);
  }

  const inputImages = inputImagesByRef(args.input_images);
  const baseInvocation: RunManifest['invocation'] = {
    tool: 'image_task',
    goal: args.goal,
    inputImages,
    constraints: args.constraints,
    outputPath: args.outputPath,
    outputDir: args.outputDir,
  };

  try {
    await writeManifest(runDir, {
      schemaVersion: 1,
      runId,
      startedAt: new Date(startedAt).toISOString(),
      status: 'in_progress',
      invocation: baseInvocation,
      nodes: [],
    });
  } catch (err) {
    return imageTaskErrorResponse(runId, `Failed to write run manifest: ${err instanceof Error ? err.message : String(err)}`);
  }

  let plan: Plan;
  let plannerMethod: 'llm' | 'template' = 'llm';
  let plannerInfo: {
    model: string;
    tokens: { input?: number; output?: number };
    latency_ms: number;
  };
  const templateMatch = matchTemplate({
    goal: args.goal,
    inputImages,
    constraints: args.constraints,
  }, capabilityRegistry);

  const gate = checkBudgetGate({
    constraints: args.constraints,
    templateMatched: templateMatch !== null,
  });
  if (!gate.ok) {
    return imageTaskErrorResponse(runId, gate.error);
  }

  if (templateMatch) {
    plannerMethod = 'template';
    plan = templateMatch.plan;
    plannerInfo = { model: `template:${templateMatch.templateId}`, tokens: {}, latency_ms: 0 };
  } else {
    try {
      const planner = await planImageTask({
        goal: args.goal,
        inputImages,
        constraints: args.constraints,
      }, capabilityRegistry, { seed: args.seed } as never);
      plan = planner.plan;
      plannerInfo = {
        model: 'claude-haiku-4-5',
        tokens: {
          input: planner.usage.promptTokens,
          output: planner.usage.completionTokens,
        },
        latency_ms: planner.latencyMs,
      };
    } catch (err) {
      return imageTaskPlannerErrorResponse(runId, err);
    }
  }

  const validation = await validatePlan(plan, {
    inputImages,
    constraints: args.constraints ?? {},
    registry: capabilityRegistry,
  });
  if (!validation.ok) {
    return imageTaskValidationErrorResponse(runId, validation);
  }

  if (args.dry_run === true) {
    return dryRunResponse(plan, runId, plannerMethod);
  }

  let dagResult: ExecResult;
  try {
    dagResult = await executeDag(plan, inputImages, { runId, runDir });
    await saveTerminalOutput({
      dagResult,
      plan,
      outputPath: args.outputPath,
      outputDir: args.outputDir,
      goal: args.goal,
    });
  } catch (err) {
    return imageTaskErrorResponse(runId, err instanceof Error ? err.message : String(err));
  }

  const endedAt = Date.now();
  const finalOutput = dagResult.nodeOutputs[plan.terminalNodeId];
  try {
    await writeManifest(runDir, {
      schemaVersion: 1,
      runId,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      status: dagResult.totals.failure > 0 ? 'error' : 'success',
      invocation: baseInvocation,
      nodes: dagResult.trace.nodes.map((node) => ({
        id: node.id,
        op: String(node.op),
        provider: node.provider,
        model: node.model,
        artifactPath: node.artifactPath,
        durationMs: node.durationMs,
        outcome: node.outcome,
        error: node.error,
      })),
      plan,
      planner: plannerInfo,
      totals: dagResult.totals,
      bestPartial: dagResult.bestPartial,
      finalOutput: finalOutput?.kind === 'image' ? finalOutput.artifactPath : undefined,
      totalDurationMs: endedAt - startedAt,
      error: dagResult.totals.failure > 0
        ? `Node ${dagResult.trace.nodes.find((node) => node.outcome === 'error')?.id ?? 'unknown'} failed`
        : undefined,
    });
  } catch (err) {
    console.error(`[image_task] manifest write failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const response = serializeImageTaskResponse({ plan, dagResult, runId, plannerMethod });
    return { content: [{ type: 'text' as const, text: JSON.stringify(response) }] };
  } catch (err) {
    if (err instanceof ResponseGuardError) {
      return imageTaskErrorResponse(runId, `Response guard tripped: ${err.message}`);
    }
    throw err;
  }
}

// Determine SSE port from --sse flag or MCP_SSE_PORT env var.
// Returns undefined when stdio mode should be used.
function getSSEPort(): number | undefined {
  const idx = process.argv.indexOf('--sse');
  if (idx !== -1) {
    const next = process.argv[idx + 1];
    const port = next ? parseInt(next, 10) : 3101;
    return Number.isNaN(port) ? 3101 : port;
  }
  const envPort = process.env.MCP_SSE_PORT;
  if (envPort) {
    const port = parseInt(envPort, 10);
    return Number.isNaN(port) ? 3101 : port;
  }
  return undefined;
}

// Start the server
async function main() {
  const availableProviders = registry.getAvailable();
  const availableCapabilities = capabilityRegistry.list();

  if (availableProviders.length === 0 && availableCapabilities.length === 0) {
    console.error('No image providers or capabilities configured.');
    console.error('  Rebuild the project and check startup logs. Remote providers require API keys:');
    console.error('  OPENAI_API_KEY, GEMINI_API_KEY, REPLICATE_API_TOKEN, TOGETHER_API_KEY, or XAI_API_KEY');
    process.exit(1);
  }

  console.error(`Image Gen MCP Server starting...`);
  console.error(`Available providers: ${availableProviders.join(', ') || '(none)'}`);
  console.error(`Default provider: ${DEFAULT_PROVIDER}${registry.has(DEFAULT_PROVIDER) ? '' : ' (not available, will need explicit provider)'}`);
  console.error(`Size-capable providers: ${registry.getSizeCapable().join(', ')}`);
  console.error(`Capabilities: ${availableCapabilities.map((c) => `${c.op}:${c.provider}`).join(', ') || '(none)'}`);
  console.error(`Processing operations: resize, crop, aspectCrop, circleMask`);
  console.error(`Asset types: profile_pic, post_image, hero_photo, avatar, scene, avery_8293, avery_5160, avery_22830, avery_8164`);

  // Phase 6: retention sweep — startup-only (no periodic timer).
  // INVARIANT: this runs before MCP transport.connect, so no image_op call is in flight.
  const retentionHours = parseRetentionHours(process.env.IMAGE_GEN_RUN_RETENTION_HOURS);
  try {
    const sweep = await sweepRunArtifacts(retentionHours);
    console.error(
      `Run retention: scanned=${sweep.scanned} deleted=${sweep.deleted} skipped=${sweep.skipped} retention=${retentionHours}h${sweep.errors.length ? ` errors=${sweep.errors.length}` : ''}`,
    );
  } catch (err) {
    console.error(
      `Run retention sweep failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const ssePort = getSSEPort();

  if (ssePort) {
    // ── SSE mode ────────────────────────────────────────────────
    const app = express();
    app.use(express.json());

    // Map sessionId → transport for routing POST messages
    const transports = new Map<string, SSEServerTransport>();

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', transport: 'sse', providers: availableProviders });
    });

    app.get('/sse', async (req, res) => {
      // Each SSE client gets its own McpServer + transport
      const server = createServer();
      const transport = new SSEServerTransport('/messages', res);
      transports.set(transport.sessionId, transport);

      transport.onclose = () => {
        transports.delete(transport.sessionId);
        console.error(`SSE client disconnected: ${transport.sessionId}`);
      };

      console.error(`SSE client connected: ${transport.sessionId}`);
      await server.connect(transport);
    });

    app.post('/messages', async (req, res) => {
      const sessionId = req.query.sessionId as string | undefined;
      if (!sessionId) {
        res.status(400).json({ error: 'Missing sessionId query parameter' });
        return;
      }

      const transport = transports.get(sessionId);
      if (!transport) {
        res.status(404).json({ error: 'Unknown session' });
        return;
      }

      await transport.handlePostMessage(req, res, req.body);
    });

    const httpServer = http.createServer(app);

    // Graceful shutdown
    const shutdown = () => {
      console.error('\nShutting down SSE server...');
      for (const transport of transports.values()) {
        transport.close().catch(() => {});
      }
      transports.clear();
      httpServer.close(() => {
        console.error('SSE server stopped.');
        process.exit(0);
      });
      // Force exit after 5s if connections linger
      setTimeout(() => process.exit(0), 5000).unref();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    httpServer.listen(ssePort, () => {
      console.error(`SSE transport listening on http://localhost:${ssePort}`);
      console.error(`  SSE endpoint:     GET  http://localhost:${ssePort}/sse`);
      console.error(`  Message endpoint: POST http://localhost:${ssePort}/messages`);
      console.error(`  Health endpoint:  GET  http://localhost:${ssePort}/health`);
    });
  } else {
    // ── stdio mode (default, backward compatible) ───────────────
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

const isDirectInvocation =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isDirectInvocation) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
