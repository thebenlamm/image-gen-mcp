import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Capability } from '../../src/capabilities/types.js';
import { createRunId } from '../../src/runs/id.js';
import { manifestPath, resolveRunDir } from '../../src/runs/dir.js';
import { writeManifest } from '../../src/runs/manifest.js';
import { executeDag, type ExecPlan } from '../../src/task/dag-executor.js';

function makeImageCap(op: string): Capability {
  return {
    op,
    provider: 'mock',
    modelVersion: 'mock-1',
    constraints: {},
    cost: { perCallUsd: 0 },
    invoke: vi.fn(async () => ({
      kind: 'image' as const,
      buffer: Buffer.from('fake-png'),
      model: 'mock-1',
    })),
  } as unknown as Capability;
}

function makeRegistry(capsByKey: Record<string, Capability>) {
  return {
    get: (op: string, provider: string) => capsByKey[`${op}:${provider}`],
  };
}

function hasLongBase64(value: string): boolean {
  return /[A-Za-z0-9+/=]{1000,}/.test(value);
}

describe('image_task happy-path DAG integration', () => {
  let outputRoot: string;
  let previousOutputDir: string | undefined;

  beforeEach(async () => {
    previousOutputDir = process.env.IMAGE_GEN_OUTPUT_DIR;
    outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'image-task-dag-'));
    process.env.IMAGE_GEN_OUTPUT_DIR = outputRoot;
  });

  afterEach(async () => {
    if (previousOutputDir === undefined) {
      delete process.env.IMAGE_GEN_OUTPUT_DIR;
    } else {
      process.env.IMAGE_GEN_OUTPUT_DIR = previousOutputDir;
    }
    await fs.rm(outputRoot, { recursive: true, force: true });
  });

  it('produces three success trace nodes, artifacts, and an image_task manifest', async () => {
    const plan: ExecPlan = {
      goal: 'extract product, composite, transform',
      inputImages: { product: '/fake/product.png', bg: '/fake/bg.png' },
      nodes: [
        { id: 'extract', op: 'extract_subject', provider: 'mock', params: { input: '$inputs.product' }, dependsOn: [], outputKind: 'image', costUsd: 0.01 },
        {
          id: 'composite',
          op: 'composite_layers',
          provider: 'mock',
          params: {
            canvas: { width: 512, height: 512 },
            layers: [{ input: '$inputs.bg' }, { input: '$nodes.extract.output' }],
          },
          dependsOn: ['extract'],
          outputKind: 'image',
          costUsd: 0.02,
        },
        {
          id: 'transform',
          op: 'transform',
          provider: 'mock',
          params: { input: '$nodes.composite.output', operations: [{ type: 'resize', width: 512 }] },
          dependsOn: ['composite'],
          outputKind: 'image',
          costUsd: 0.005,
        },
      ],
      terminalNodeId: 'transform',
    };
    const extract = makeImageCap('extract_subject');
    const composite = makeImageCap('composite_layers');
    const transform = makeImageCap('transform');
    const runId = createRunId();
    const runDir = await resolveRunDir(runId);

    const result = await executeDag(plan, plan.inputImages!, {
      runId,
      runDir,
      registry: makeRegistry({
        'extract_subject:mock': extract,
        'composite_layers:mock': composite,
        'transform:mock': transform,
      }),
    });

    expect(result.trace.nodes.map((node) => node.id)).toEqual(['nextract', 'ncomposite', 'ntransform']);
    expect(result.trace.nodes.every((node) => node.outcome === 'success')).toBe(true);
    expect(result.totals).toMatchObject({ cost_usd: 0.035, success: 3, failure: 0, skipped: 0 });
    expect(typeof result.totals.latency_ms).toBe('number');
    expect(result.bestPartial?.nodeId).toBe('transform');
    await expect(fs.access(path.join(runDir, 'nextract.png'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(runDir, 'ncomposite.png'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(runDir, 'ntransform.png'))).resolves.toBeUndefined();
    expect(composite.invoke).toHaveBeenCalledWith(expect.objectContaining({
      params: expect.objectContaining({
        layers: [{ input: '/fake/bg.png' }, { input: path.join(runDir, 'nextract.png') }],
      }),
    }));

    await writeManifest(runDir, {
      schemaVersion: 1,
      runId,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      status: 'success',
      invocation: {
        tool: 'image_task',
        goal: plan.goal,
        inputImages: plan.inputImages,
        constraints: plan.constraints,
      },
      nodes: result.trace.nodes.map((node) => ({
        id: node.id,
        op: node.op,
        provider: node.provider,
        artifactPath: node.artifactPath,
        durationMs: node.durationMs,
        outcome: node.outcome,
      })),
      plan,
      totals: result.totals,
      bestPartial: result.bestPartial,
    });
    const manifest = JSON.parse(await fs.readFile(manifestPath(runDir), 'utf8'));
    expect(manifest.invocation.tool).toBe('image_task');
    expect(manifest.invocation.goal).toBe(plan.goal);
    expect(manifest.plan.terminalNodeId).toBe('transform');
    expect(manifest.totals.success).toBe(3);
    expect(manifest.bestPartial.nodeId).toBe('transform');

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('data:');
    expect(hasLongBase64(serialized)).toBe(false);
  });
});
