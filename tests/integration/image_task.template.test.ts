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
  outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'image-task-template-output-'));
  inputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'image-task-template-input-'));
  inputPath = path.join(inputRoot, 'source.png');
  await fs.writeFile(inputPath, make1pxPng());
  process.env.IMAGE_GEN_OUTPUT_DIR = outputRoot;
  process.env.IMAGE_GEN_INPUT_ROOT = inputRoot;
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(async () => {
  cleanupMocks();
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

describe('image_task template fast path', () => {
  it('returns success for profile_pic without ANTHROPIC_API_KEY and marks plannerMethod=template', async () => {
    const handleImageTask = await importHandleImageTask();

    const parsed = parseResponse(await handleImageTask({ goal: 'profile_pic', input_images: [inputPath] }));

    expect(parsed.success).toBe(true);
    expect(parsed.plannerMethod).toBe('template');
    expect(parsed.trace.plannerMethod).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain('PLANNER_AUTH');
  });

  it('routes template dry_run without provider execution or Anthropic planning', async () => {
    const handleImageTask = await importHandleImageTask();

    const parsed = parseResponse(await handleImageTask({
      goal: 'profile_pic',
      input_images: [inputPath],
      dry_run: true,
    }));

    expect(parsed.success).toBe(true);
    expect(parsed.dry_run).toBe(true);
    expect(parsed.plannerMethod).toBe('template');
    expect(parsed.trace).toEqual([]);
    expect(parsed.output).toBeUndefined();
  });

  it('validates template plans before dry_run success', async () => {
    const outsideRoot = path.join(os.tmpdir(), `outside-template-${Date.now()}.png`);
    await fs.writeFile(outsideRoot, make1pxPng());
    const handleImageTask = await importHandleImageTask();

    const parsed = parseResponse(await handleImageTask({
      goal: 'profile_pic',
      input_images: [outsideRoot],
      dry_run: true,
    }));
    await fs.rm(outsideRoot, { force: true });

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('INPUT_PATH_OUTSIDE_ROOT');
    expect(parsed.trace).toEqual([]);
  });

  it('writes template planner sentinel to the run manifest', async () => {
    const handleImageTask = await importHandleImageTask();

    const parsed = parseResponse(await handleImageTask({ goal: 'profile_pic', input_images: [inputPath] }));
    const manifest = JSON.parse(await fs.readFile(
      path.join(outputRoot, '.runs', parsed.runId, 'manifest.json'),
      'utf8',
    ));

    expect(manifest.planner.model).toBe('template:profile_pic');
  });

  it('marks non-template planner responses as plannerMethod=llm', async () => {
    process.env.ANTHROPIC_API_KEY = 'unused-by-mock';
    const { handleImageTask, capabilityRegistry } = await importHandleImageTaskWithPlanner(makePlan());
    registerMockCapabilities(capabilityRegistry);

    const parsed = parseResponse(await handleImageTask({
      goal: 'remove background and composite product',
      input_images: [inputPath],
    }));

    expect(parsed.success).toBe(true);
    expect(parsed.plannerMethod).toBe('llm');
    expect(parsed.trace.plannerMethod).toBeUndefined();
  });
});
