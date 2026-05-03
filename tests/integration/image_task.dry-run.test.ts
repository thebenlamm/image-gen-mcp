// Phase 9 dry-run contract: when the MCP caller passes dry_run: true,
// the handler validates the plan and returns it WITHOUT invoking executeDag.
// Therefore "dry-run integration" reduces to "validation succeeds + executeDag
// not called". 09-03 wires this at the MCP boundary.

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Capability } from '../../src/capabilities/types.js';
import { createRunId } from '../../src/runs/id.js';
import { resolveRunDir } from '../../src/runs/dir.js';
import type { Plan } from '../../src/task/plan-schema.js';
import { executeDag, type ExecPlan } from '../../src/task/dag-executor.js';
import { validatePlan } from '../../src/task/plan-validator.js';

function makeCap(op: string): Capability {
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
    list: (op?: string) => Object.values(capsByKey).filter((cap) => op === undefined || cap.op === op),
  };
}

describe('image_task dry-run integration', () => {
  let outputRoot: string;
  let previousOutputDir: string | undefined;

  beforeEach(async () => {
    previousOutputDir = process.env.IMAGE_GEN_OUTPUT_DIR;
    outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'image-task-dry-run-'));
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

  function buildPlan(): Plan {
    return {
      version: 1,
      goal: 'extract product, composite, transform',
      nodes: [
        { id: 'extract', op: 'extract_subject', provider: 'mock', params: { input: '$inputs.product' }, dependsOn: [], outputKind: 'image', costUsd: 0.01, latencyMs: 10 },
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
          latencyMs: 10,
        },
        {
          id: 'transform',
          op: 'transform',
          provider: 'mock',
          params: { input: '$nodes.composite.output', operations: [{ type: 'resize', width: 512 }] },
          dependsOn: ['composite'],
          outputKind: 'image',
          costUsd: 0.005,
          latencyMs: 10,
        },
      ],
      terminalNodeId: 'transform',
      estimatedTotalCostUsd: 0.035,
      estimatedTotalLatencyMs: 30,
    };
  }

  it('validates and serializes the plan without invoking capabilities', async () => {
    const caps = {
      'extract_subject:mock': makeCap('extract_subject'),
      'composite_layers:mock': makeCap('composite_layers'),
      'transform:mock': makeCap('transform'),
    };
    const registry = makeRegistry(caps);
    const validated = await validatePlan(buildPlan(), {
      inputImages: { product: '/fake/product.png', bg: '/fake/bg.png' },
      constraints: {},
      registry,
    });

    expect(validated.ok).toBe(true);
    expect(JSON.parse(JSON.stringify(buildPlan()))).toMatchObject({ terminalNodeId: 'transform' });
    for (const cap of Object.values(caps)) {
      expect(cap.invoke).toHaveBeenCalledTimes(0);
    }
  });

  it('invokes capabilities when the executor is called on the same plan', async () => {
    const caps = {
      'extract_subject:mock': makeCap('extract_subject'),
      'composite_layers:mock': makeCap('composite_layers'),
      'transform:mock': makeCap('transform'),
    };
    const execPlan = buildPlan() as ExecPlan;
    const runId = createRunId();
    const runDir = await resolveRunDir(runId);
    await executeDag(execPlan, { product: '/fake/product.png', bg: '/fake/bg.png' }, {
      runId,
      runDir,
      registry: makeRegistry(caps),
    });
    for (const cap of Object.values(caps)) {
      expect(cap.invoke).toHaveBeenCalledTimes(1);
    }
  });
});
