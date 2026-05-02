import * as fs from 'fs/promises';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { capabilityRegistry } from '../../src/capabilities/registry.js';
import type { Capability, CapabilityOp } from '../../src/capabilities/types.js';
import { EVAL_RESULTS_DIR } from '../../src/eval/results.js';
import { runEval } from '../../src/eval/run.js';

async function fakePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.5 },
    },
  }).png().toBuffer();
}

function registerFakeCapability(
  op: CapabilityOp,
  provider: string,
  invoke: Capability['invoke'] = async () => ({ buffer: await fakePng(), model: 'fake-model' }),
): { unregister: () => void } {
  capabilityRegistry.register({
    op,
    provider,
    modelVersion: 'fake-model-v1',
    constraints: { outputFormat: 'png' },
    cost: { perCallUsd: 0 },
    invoke,
  }, { allowUnscoredProduction: true });

  return { unregister: () => capabilityRegistry.unregister(op, provider) };
}

async function readResult(resultPath: string): Promise<any> {
  return JSON.parse(await fs.readFile(resultPath, 'utf8'));
}

async function removeEvalResults(): Promise<void> {
  await fs.rm(EVAL_RESULTS_DIR, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 20,
  });
}

describe('eval runner registry quality application', () => {
  const registered: Array<{ unregister: () => void }> = [];
  const previousOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(async () => {
    delete process.env.OPENAI_API_KEY;
    await removeEvalResults();
  });

  afterEach(async () => {
    while (registered.length) registered.pop()!.unregister();
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    await removeEvalResults();
  });

  it('populates matching capability quality scores in-process and leaves unmatched capabilities unscored', async () => {
    registered.push(registerFakeCapability('extract_subject', '@imgly/local'));
    registered.push(registerFakeCapability('extract_subject', 'fake/no-matching-case'));

    const resultPath = await runEval();
    const result = await readResult(resultPath);

    expect(capabilityRegistry.get('extract_subject', '@imgly/local')?.quality?.scores)
      .toBeDefined();
    expect(capabilityRegistry.get('extract_subject', '@imgly/local')?.quality?.evalResultPath)
      .toBe(resultPath);
    expect(capabilityRegistry.get('extract_subject', 'fake/no-matching-case')?.quality?.scores)
      .toBeUndefined();
    expect(result.results.some((entry: any) =>
      entry.op === 'extract_subject' &&
      entry.provider === '@imgly/local' &&
      entry.status === 'scored'
    )).toBe(true);
  });
});
