import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Capability } from '../../src/capabilities/types.js';
import { createRunId } from '../../src/runs/id.js';
import { resolveRunDir } from '../../src/runs/dir.js';
import { executeDag, type ExecPlan } from '../../src/task/dag-executor.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeDelayedImageCap(op: string, delayMs: number): Capability {
  return {
    op,
    provider: 'mock',
    modelVersion: 'mock-1',
    constraints: {},
    cost: { perCallUsd: 0 },
    invoke: vi.fn(async () => {
      await sleep(delayMs);
      return { kind: 'image' as const, buffer: Buffer.from('fake-png'), model: 'mock-1' };
    }),
  } as unknown as Capability;
}

function makeRegistry(capsByKey: Record<string, Capability>) {
  return {
    get: (op: string, provider: string) => capsByKey[`${op}:${provider}`],
  };
}

describe('image_task bounded executor parallelism', () => {
  let outputRoot: string;
  let previousOutputDir: string | undefined;

  beforeEach(async () => {
    previousOutputDir = process.env.IMAGE_GEN_OUTPUT_DIR;
    outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'image-task-parallelism-'));
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

  it('executes two independent extract nodes with overlapping wall-clock time', async () => {
    const singleNodeDurationMs = 200;
    const plan: ExecPlan = {
      goal: 'extract two subjects and composite',
      nodes: [
        { id: 'A', op: 'extract_subject', provider: 'mock-A', params: {}, dependsOn: [], outputKind: 'image' },
        { id: 'B', op: 'extract_subject', provider: 'mock-B', params: {}, dependsOn: [], outputKind: 'image' },
        {
          id: 'C',
          op: 'composite_layers',
          provider: 'mock-C',
          params: {
            canvas: { width: 1, height: 1 },
            layers: [{ input: '$nodes.A.output' }, { input: '$nodes.B.output' }],
          },
          dependsOn: ['A', 'B'],
          outputKind: 'image',
        },
      ],
      terminalNodeId: 'C',
    };
    const runId = createRunId();
    const runDir = await resolveRunDir(runId);
    const startedAt = Date.now();

    const result = await executeDag(plan, {}, {
      runId,
      runDir,
      registry: makeRegistry({
        'extract_subject:mock-A': makeDelayedImageCap('extract_subject', singleNodeDurationMs),
        'extract_subject:mock-B': makeDelayedImageCap('extract_subject', singleNodeDurationMs),
        'composite_layers:mock-C': makeDelayedImageCap('composite_layers', 1),
      }),
    });

    const elapsedMs = Date.now() - startedAt;
    expect(result.totals).toMatchObject({ success: 3, failure: 0, skipped: 0 });
    expect(elapsedMs).toBeLessThan(singleNodeDurationMs * 1.75);
  });
});
