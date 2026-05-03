import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { capabilityRegistry } from '../../src/capabilities/registry.js';
import type { Capability, CapabilityOp } from '../../src/capabilities/types.js';
import { EVAL_RESULTS_DIR } from '../../src/eval/results.js';
import { hasUsableEnv, runEval, scorePassed } from '../../src/eval/run.js';

const registered: Array<{ unregister: () => void }> = [];

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
  invoke: Capability['invoke'] = async () => ({
    kind: 'image' as const,
    buffer: await fakePng(),
    model: 'fake-model',
  }),
): { unregister: () => void } {
  capabilityRegistry.register({
    op,
    provider,
    modelVersion: 'fake-model-v1',
    constraints: { outputFormat: 'png' },
    cost: { perCallUsd: 0 },
    invoke,
  });

  return { unregister: () => capabilityRegistry.unregister(op, provider) };
}

function registerFakeLocalEvalCapabilities(
  overrides: Partial<Record<CapabilityOp, Capability['invoke']>> = {},
): void {
  registered.push(registerFakeCapability('extract_subject', '@imgly/local', overrides.extract_subject));
  registered.push(registerFakeCapability('composite_layers', 'sharp', overrides.composite_layers ?? (async () => ({
    kind: 'image' as const,
    buffer: await fs.readFile('eval/fixtures/composite-golden.png'),
    model: 'fake-model',
  }))));
  registered.push(registerFakeCapability('analyze_dimensions', 'sharp', overrides.analyze_dimensions ?? (async () => ({
    kind: 'data' as const,
    data: { type: 'dimensions', width: 256, height: 128, format: 'png', channels: 4, hasAlpha: true },
    model: 'fake-model',
  }))));
  registered.push(registerFakeCapability('analyze_palette', 'sharp', overrides.analyze_palette ?? (async () => ({
    kind: 'data' as const,
    data: {
      type: 'palette',
      colors: [
        { hex: '#ff0000', r: 255, g: 0, b: 0, weight: 0.34 },
        { hex: '#00ff00', r: 0, g: 255, b: 0, weight: 0.33 },
        { hex: '#0000ff', r: 0, g: 0, b: 255, weight: 0.33 },
      ],
    },
    model: 'fake-model',
  }))));
  registered.push(registerFakeCapability('analyze_ocr', 'tesseract', overrides.analyze_ocr ?? (async () => ({
    kind: 'data' as const,
    data: { type: 'ocr', text: 'SALE', confidence: 95 },
    model: 'fake-model',
  }))));
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

describe('eval runner', () => {
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

  it('detects unresolved and missing environment variables', () => {
    delete process.env.OPENAI_API_KEY;
    expect(hasUsableEnv('OPENAI_API_KEY')).toBe(false);
    process.env.OPENAI_API_KEY = '${OPENAI_API_KEY}';
    expect(hasUsableEnv('OPENAI_API_KEY')).toBe(false);
    process.env.OPENAI_API_KEY = ' real-key ';
    expect(hasUsableEnv('OPENAI_API_KEY')).toBe(true);
  });

  it('writes result JSON for scored local cases and skipped provider cases', async () => {
    registerFakeLocalEvalCapabilities();
    registered.push(registerFakeCapability('edit_prompt', 'openai', async () => {
      throw new Error('OpenAI should not be invoked without usable env');
    }));

    const resultPath = await runEval();
    const result = await readResult(resultPath);

    expect(path.dirname(resultPath)).toBe(EVAL_RESULTS_DIR);
    expect(result.schemaVersion).toBe(1);
    expect(result.results.some((entry: any) => entry.op === 'extract_subject')).toBe(true);
    expect(result.results.some((entry: any) => entry.status === 'scored')).toBe(true);
    const skippedOpenAi = result.results.filter(
      (entry: any) => entry.op === 'edit_prompt' && entry.provider === 'openai',
    );
    expect(skippedOpenAi).toHaveLength(3);
    expect(skippedOpenAi.every((entry: any) => entry.status === 'skipped')).toBe(true);
  });

  it('skips OpenAI cases for placeholder env without invoking capability', async () => {
    process.env.OPENAI_API_KEY = '${OPENAI_API_KEY}';
    registerFakeLocalEvalCapabilities();
    registered.push(registerFakeCapability('extract_subject', '@imgly/local'));
    registered.push(registerFakeCapability('edit_prompt', 'openai', async () => {
      throw new Error('OpenAI should not be invoked for placeholder env');
    }));

    const result = await readResult(await runEval());

    expect(
      result.results
        .filter((entry: any) => entry.provider === 'openai')
        .every((entry: any) => entry.error === 'missing required env: OPENAI_API_KEY'),
    ).toBe(true);
  });

  it('fails when a non-env-gated capability is missing', async () => {
    registerFakeLocalEvalCapabilities();
    capabilityRegistry.unregister('extract_subject', '@imgly/local');

    await expect(runEval()).rejects.toThrow(/eval failed/);

    const files = await fs.readdir(EVAL_RESULTS_DIR);
    const result = await readResult(path.join(EVAL_RESULTS_DIR, files.find((file) => file.endsWith('.json'))!));

    expect(
      result.results.some(
        (entry: any) =>
          entry.op === 'extract_subject' &&
          entry.provider === '@imgly/local' &&
          entry.status === 'error' &&
          entry.error === 'capability not registered: extract_subject/@imgly/local',
      ),
    ).toBe(true);
  });

  it('still skips missing env-gated provider capabilities', async () => {
    registerFakeLocalEvalCapabilities();
    registered.push(registerFakeCapability('extract_subject', '@imgly/local'));

    const result = await readResult(await runEval());

    expect(
      result.results
        .filter((entry: any) => entry.op === 'edit_prompt' && entry.provider === 'openai')
        .every((entry: any) => entry.status === 'skipped'),
    ).toBe(true);
  });

  it('writes results then fails when any eval case errors', async () => {
    let calls = 0;
    registerFakeLocalEvalCapabilities();
    registered.push(registerFakeCapability('extract_subject', '@imgly/local', async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('scoring candidate failed');
      }
      return { kind: 'image' as const, buffer: await fakePng(), model: 'fake-model' };
    }));

    await expect(runEval()).rejects.toThrow(/eval failed 1 case/);

    const files = await fs.readdir(EVAL_RESULTS_DIR);
    const result = await readResult(path.join(EVAL_RESULTS_DIR, files.find((file) => file.endsWith('.json'))!));
    expect(result.results.some((entry: any) => entry.status === 'error')).toBe(true);
    expect(result.results.some((entry: any) => entry.status === 'scored')).toBe(true);
  });

  it('enforces declared pixel delta thresholds', () => {
    expect(scorePassed(
      { scorer: 'pixel_delta', status: 'scored', value: 0.01 },
      { maxPixelDelta: 0.05 },
    )).toBe(true);
    expect(scorePassed(
      { scorer: 'pixel_delta', status: 'scored', value: 0.2 },
      { maxPixelDelta: 0.05 },
    )).toBe(false);
    expect(scorePassed(
      { scorer: 'pixel_delta', status: 'scored', value: 0 },
      { minPixelDelta: 0.01 },
    )).toBe(false);
  });
});
