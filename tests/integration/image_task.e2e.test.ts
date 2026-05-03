import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupMocks,
  importHandleImageTaskWithPlanner,
  make1pxPng,
  makePlan,
  registerMockCapabilities,
} from './__helpers__/image-task-mocks.js';

const fixturePath = path.resolve('tests/fixtures/product.jpg');
const goal = 'remove the background and place this on a clean white studio surface, 2000px square';

let outputRoot: string;
let previousOutputDir: string | undefined;

beforeEach(async () => {
  previousOutputDir = process.env.IMAGE_GEN_OUTPUT_DIR;
  outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'image-task-e2e-'));
  process.env.IMAGE_GEN_OUTPUT_DIR = outputRoot;
});

afterEach(async () => {
  cleanupMocks();
  if (previousOutputDir === undefined) {
    delete process.env.IMAGE_GEN_OUTPUT_DIR;
  } else {
    process.env.IMAGE_GEN_OUTPUT_DIR = previousOutputDir;
  }
  await fs.rm(outputRoot, { recursive: true, force: true });
});

function parseResponse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

function walkStrings(value: unknown, visit: (s: string, path: string) => void, pathName = '$'): void {
  if (typeof value === 'string') {
    visit(value, pathName);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, visit, `${pathName}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => walkStrings(nested, visit, `${pathName}.${key}`));
  }
}

describe('SC#1 image_task success path', () => {
  it('returns final path, runId, totals, and a three-node trace', async () => {
    const { handleImageTask, capabilityRegistry } = await importHandleImageTaskWithPlanner(makePlan());
    registerMockCapabilities(capabilityRegistry);

    const parsed = parseResponse(await handleImageTask({ goal, input_images: [fixturePath] }));

    expect(parsed.success).toBe(true);
    expect(parsed.output.path).toMatch(/\.png$/);
    expect(parsed.runId).toBeTruthy();
    expect(parsed.total_cost_usd).toBeGreaterThan(0);
    expect(parsed.total_latency_ms).toBeGreaterThanOrEqual(0);
    expect(parsed.trace.map((node: { op: string }) => node.op)).toEqual([
      'extract_subject',
      'composite_layers',
      'transform',
    ]);
    expect(await fs.stat(parsed.output.path)).toBeTruthy();
  });
});

describe('SC#2 image_task dry_run', () => {
  it('returns the validated plan and estimated totals without provider invocation', async () => {
    const plan = makePlan();
    const { handleImageTask, capabilityRegistry } = await importHandleImageTaskWithPlanner(plan);
    const { mockInvoke } = registerMockCapabilities(capabilityRegistry);

    const parsed = parseResponse(await handleImageTask({ goal, input_images: [fixturePath], dry_run: true }));

    expect(parsed.success).toBe(true);
    expect(parsed.dry_run).toBe(true);
    expect(parsed.plan.steps).toHaveLength(3);
    expect(parsed.total_cost_usd).toBe(plan.estimatedTotalCostUsd);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('SC#3 image_task budget cap', () => {
  it('returns BUDGET_CAP_EXCEEDED before any provider call', async () => {
    const { handleImageTask, capabilityRegistry } = await importHandleImageTaskWithPlanner(makePlan());
    const { mockInvoke } = registerMockCapabilities(capabilityRegistry);

    const parsed = parseResponse(await handleImageTask({
      goal,
      input_images: [fixturePath],
      constraints: { budget_cap_usd: 0.001 },
    }));

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('BUDGET_CAP_EXCEEDED');
    expect(parsed.error.estimated_cost_usd).toBe(0.035);
    expect(parsed.error.cap_usd).toBe(0.001);
    expect(parsed.trace).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('SC#4 image_task mid-DAG failure', () => {
  it('surfaces failed node, structured error, skipped downstream, and best partial', async () => {
    const { handleImageTask, capabilityRegistry, CapabilityInvokeError } = await importHandleImageTaskWithPlanner(makePlan());
    const compositeFailure = vi.fn(async () => {
      throw new CapabilityInvokeError('PROVIDER_FAILURE', 'fake composite failure', false);
    });
    registerMockCapabilities(capabilityRegistry, { composite_layers: compositeFailure });

    const parsed = parseResponse(await handleImageTask({ goal, input_images: [fixturePath] }));
    const failed = parsed.trace.find((node: { op: string }) => node.op === 'composite_layers');
    const skipped = parsed.trace.find((node: { op: string }) => node.op === 'transform');

    expect(parsed.success).toBe(false);
    expect(parsed.failedNodeId).toBe('composite');
    expect(parsed.bestPartial).toMatchObject({ nodeId: 'extract' });
    expect(parsed.bestPartial.path).toMatch(/\.png$/);
    expect(failed).toMatchObject({
      status: 'error',
      error: { message: 'fake composite failure', code: 'PROVIDER_FAILURE', retryable: false },
    });
    expect(skipped.status).toBe('skipped');
  });
});

describe('SC#5 image_task path-only trace details', () => {
  it('has no base64 strings and includes cost, latency, output paths, and revisedPrompt', async () => {
    const { handleImageTask, capabilityRegistry } = await importHandleImageTaskWithPlanner(makePlan());
    registerMockCapabilities(capabilityRegistry, {
      transform: vi.fn(async () => ({
        kind: 'image' as const,
        buffer: make1pxPng(),
        model: 'mock-model',
        revisedPrompt: 'final revised prompt',
      })),
    });

    const parsed = parseResponse(await handleImageTask({ goal, input_images: [fixturePath] }));
    const serialized = JSON.stringify(parsed);

    expect(serialized).not.toContain('data:image/');
    walkStrings(parsed, (value, pathName) => {
      expect(value.includes('data:image/'), `base64 data URL at ${pathName}`).toBe(false);
      if (value.length > 1024 && /^[A-Za-z0-9+/=\r\n]+$/.test(value.replace(/\s/g, ''))) {
        throw new Error(`base64-like string at ${pathName}`);
      }
    });
    for (const node of parsed.trace) {
      expect(typeof node.cost_usd).toBe('number');
      expect(typeof node.latency_ms).toBe('number');
      if (node.status === 'success') {
        expect(node.output_path).toMatch(/\.png$/);
      }
    }
    expect(parsed.trace.some((node: { revisedPrompt?: string }) => node.revisedPrompt === 'final revised prompt')).toBe(true);
  });
});
