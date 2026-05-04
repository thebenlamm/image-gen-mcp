import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let outputRoot: string;
let inputRoot: string;
let inputPath: string;
let previousOutputDir: string | undefined;
let previousInputRoot: string | undefined;
let previousAnthropicKey: string | undefined;

beforeEach(async () => {
  previousOutputDir = process.env.IMAGE_GEN_OUTPUT_DIR;
  previousInputRoot = process.env.IMAGE_GEN_INPUT_ROOT;
  previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
  outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'image-task-budget-output-'));
  inputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'image-task-budget-input-'));
  inputPath = path.join(inputRoot, 'source.png');
  await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 4,
      background: { r: 0, g: 255, b: 0, alpha: 1 },
    },
  }).png().toFile(inputPath);
  process.env.IMAGE_GEN_OUTPUT_DIR = outputRoot;
  process.env.IMAGE_GEN_INPUT_ROOT = inputRoot;
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(async () => {
  vi.resetModules();
  if (previousOutputDir === undefined) {
    delete process.env.IMAGE_GEN_OUTPUT_DIR;
  } else {
    process.env.IMAGE_GEN_OUTPUT_DIR = previousOutputDir;
  }
  if (previousInputRoot === undefined) {
    delete process.env.IMAGE_GEN_INPUT_ROOT;
  } else {
    process.env.IMAGE_GEN_INPUT_ROOT = previousInputRoot;
  }
  if (previousAnthropicKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
  }
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.rm(inputRoot, { recursive: true, force: true });
});

function parseResponse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

async function importHandleImageTask() {
  vi.resetModules();
  const { handleImageTask } = await import('../../src/index.js');
  return handleImageTask;
}

describe('image_task budget gate', () => {
  it('rejects sub-cent non-template goals before planner auth is checked', async () => {
    const handleImageTask = await importHandleImageTask();

    const parsed = parseResponse(await handleImageTask({
      goal: 'render a sunset',
      constraints: { budget_cap_usd: 0.005 },
    }));

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('BUDGET_CAP_REQUIRES_TEMPLATE');
    expect(parsed.error.code).not.toBe('PLANNER_AUTH');
    expect(JSON.stringify(parsed)).not.toContain('PLANNER_AUTH');
    const manifest = JSON.parse(await fs.readFile(
      path.join(outputRoot, '.runs', parsed.runId, 'manifest.json'),
      'utf8',
    ));
    expect(manifest.status).toBe('error');
    expect(manifest.error).toBe(parsed.error.message);
  });

  it('allows sub-cent template goals and marks plannerMethod=template', async () => {
    const handleImageTask = await importHandleImageTask();

    const parsed = parseResponse(await handleImageTask({
      goal: 'profile_pic',
      input_images: [inputPath],
      constraints: { budget_cap_usd: 0.005 },
      dry_run: true,
    }));

    expect(parsed.success).toBe(true);
    expect(parsed.plannerMethod).toBe('template');
  });
});
