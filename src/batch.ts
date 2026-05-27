import { createRunId, resolveRunDir, writeManifest, type RunManifestNode } from './runs/index.js';
import { resolveOutputPath, saveImage } from './utils/image.js';
import { resolveProvider, buildEffectivePrompt, resolveDefaultProvider } from './provider-utils.js';
import type { ProviderName } from './providers/index.js';
import { CapabilityInvokeError, capabilityRegistry } from './capabilities/index.js';

export interface BatchItem {
  prompt: string;
  outputPath?: string;
}

export interface GenerateBatchArgs {
  items: BatchItem[];
  provider?: ProviderName;
  style?: string;
  size?: 'square' | 'landscape' | 'portrait';
  outputDir?: string;
  max_concurrent?: number;
  reference_image?: string;  // batch-level; applied to every item
  timeout_ms?: number;  // per-item HTTP timeout for edit_prompt route (1000-300000)
}

export interface BatchItemError {
  message: string;
  code?: string;
  retryable?: boolean;
  errorClass?: string;
}

export interface BatchItemResult {
  index: number;
  success: boolean;
  path?: string;
  error?: BatchItemError;
  provider: string;
  model?: string;
  revisedPrompt?: string;
  routedVia?: 'edit_prompt';
}

interface BatchItemResultInternal extends BatchItemResult {
  durationMs: number;
}

export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += limit) {
    const chunk = tasks.slice(i, i + limit);
    const chunkResults = await Promise.allSettled(chunk.map((t) => t()));
    results.push(...chunkResults);
  }
  return results;
}

function buildBatchItemError(err: unknown): BatchItemError {
  if (err instanceof CapabilityInvokeError) {
    return {
      message: err.message,
      code: err.code,
      retryable: err.retryable,
      errorClass: 'CapabilityInvokeError',
    };
  }
  if (err instanceof Error) {
    return {
      message: err.message,
      errorClass: err.name || 'Error',
    };
  }
  return { message: String(err) };
}

export async function handleGenerateBatch(
  args: GenerateBatchArgs,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { items, provider, style, size, outputDir, max_concurrent = 3, reference_image, timeout_ms } = args;
  const startedAt = Date.now();

  // Validate items
  if (!items || items.length === 0) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'items must be a non-empty array' }) }],
    };
  }
  if (items.length > 50) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'items exceeds maximum of 50' }) }],
    };
  }

  // Resolve provider once for the batch (fatal on failure)
  const defaultProvider = resolveDefaultProvider();
  const resolved = resolveProvider(provider, !!size, defaultProvider);
  if ('error' in resolved) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: resolved.error }) }],
    };
  }
  const { provider: imageProvider, providerName, sizeDropped } = resolved;
  const effectiveSize = sizeDropped ? undefined : size;

  // Create batch run artifact
  const batchRunId = createRunId();
  const runDir = await resolveRunDir(batchRunId);
  await writeManifest(runDir, {
    schemaVersion: 1,
    runId: batchRunId,
    startedAt: new Date(startedAt).toISOString(),
    status: 'in_progress',
    invocation: {
      tool: 'generate_batch',
      provider: providerName,
      outputDir,
      batchItems: items.map((item) => ({ prompt: item.prompt, outputPath: item.outputPath })),
    },
    nodes: [],
  });

  // Build per-item tasks
  const tasks = items.map((item, index) => async (): Promise<BatchItemResultInternal> => {
    const itemStartedAt = Date.now();
    try {
      const effectivePrompt = buildEffectivePrompt(item.prompt, style);

      if (reference_image) {
        const editCap = capabilityRegistry.get('edit_prompt', 'openai');
        if (!editCap) {
          throw new Error('Style anchoring requires edit_prompt:openai capability (OPENAI_API_KEY not configured)');
        }
        const capParams: Record<string, unknown> = {
          input: reference_image,
          prompt: effectivePrompt,
          size: effectiveSize,
        };
        if (timeout_ms !== undefined) capParams.timeout_ms = timeout_ms;
        const capResult = await editCap.invoke({
          params: capParams,
          outputPath: item.outputPath,
          outputDir,
        });
        if (capResult.kind !== 'image') throw new Error('edit_prompt returned non-image result');
        const filePath = await resolveOutputPath({
          outputPath: item.outputPath,
          outputDir,
          prompt: item.prompt,
          provider: 'openai',
        });
        await saveImage(capResult.buffer, filePath);
        return {
          index,
          success: true,
          path: filePath,
          provider: 'openai',
          model: capResult.model,
          revisedPrompt: capResult.revisedPrompt,
          routedVia: 'edit_prompt' as const,
          durationMs: Date.now() - itemStartedAt,
        };
      } else {
        const result = await imageProvider.generate({ prompt: effectivePrompt, size: effectiveSize });
        const filePath = await resolveOutputPath({
          outputPath: item.outputPath,
          outputDir,
          prompt: item.prompt,
          provider: providerName,
        });
        await saveImage(result.buffer, filePath);
        return {
          index,
          success: true,
          path: filePath,
          provider: providerName,
          model: result.model,
          revisedPrompt: result.revisedPrompt,
          durationMs: Date.now() - itemStartedAt,
        };
      }
    } catch (err) {
      return {
        index,
        success: false,
        error: buildBatchItemError(err),
        provider: reference_image ? 'openai' : providerName,
        durationMs: Date.now() - itemStartedAt,
      };
    }
  });

  // Execute with concurrency limit
  const settled = await runWithConcurrency(tasks, max_concurrent);

  // Collect results (per-item try/catch means fulfilled always; rejected branch is defensive)
  const itemResults: BatchItemResultInternal[] = settled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : { index: i, success: false as const, error: { message: 'Unexpected task rejection' }, provider: providerName, durationMs: 0 },
  );

  const succeeded = itemResults.filter((r) => r.success).length;
  const failed = itemResults.filter((r) => !r.success).length;
  const batchStatus: 'success' | 'partial' | 'error' =
    failed === 0 ? 'success' : succeeded === 0 ? 'error' : 'partial';
  const endedAt = Date.now();

  // Build manifest nodes (manifest expects a string error; render the structured shape)
  const nodes: RunManifestNode[] = itemResults.map((r) => ({
    id: `item-${r.index}`,
    op: 'generate',
    provider: r.provider,
    model: r.model,
    durationMs: r.durationMs,
    outcome: r.success ? 'success' : 'error',
    ...(r.success || !r.error
      ? {}
      : { error: r.error.code ? `[${r.error.code}] ${r.error.message}` : r.error.message }),
  }));

  // Write terminal manifest (failure is non-fatal — items already done)
  try {
    await writeManifest(runDir, {
      schemaVersion: 1,
      runId: batchRunId,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      status: batchStatus,
      invocation: {
        tool: 'generate_batch',
        provider: providerName,
        outputDir,
        batchItems: items.map((item) => ({ prompt: item.prompt, outputPath: item.outputPath })),
      },
      nodes,
      totalDurationMs: endedAt - startedAt,
    });
  } catch (err) {
    console.error(`[generate_batch] manifest write failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Build response (strip durationMs from public items)
  const responseItems: BatchItemResult[] = itemResults.map(({ durationMs: _d, ...rest }) => rest);
  const response: Record<string, unknown> = {
    batchRunId,
    status: batchStatus,
    summary: { total: items.length, succeeded, failed },
    items: responseItems,
  };
  if (reference_image) {
    response.routedVia = 'edit_prompt';
    response.referenceImage = reference_image;
  }
  if (sizeDropped) {
    response.warning = `Provider '${providerName}' does not support size parameter; size was ignored.`;
  }

  return { content: [{ type: 'text' as const, text: JSON.stringify(response) }] };
}
