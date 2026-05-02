import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { withTmpOutputDir, type TmpOutputDir } from '../helpers/tmpOutputDir.js';
import { capabilityRegistry } from '../../src/capabilities/registry.js';
import type { Capability, CapabilityOp } from '../../src/capabilities/types.js';
import { handleImageOp } from '../../src/index.js';
import { sweepRunArtifacts } from '../../src/runs/retention.js';
import { RUN_ID_REGEX } from '../../src/runs/id.js';

const FAKE_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex',
);

function registerFakeCapability(
  op: CapabilityOp,
  provider: string,
  opts?: { throws?: Error },
): { unregister: () => void } {
  const cap: Capability = {
    op,
    provider,
    modelVersion: 'test-1',
    constraints: { outputFormat: 'png' },
    cost: { perCallUsd: 0 },
    invoke: async () => {
      if (opts?.throws) throw opts.throws;
      return { buffer: FAKE_PNG, model: 'fake-model' };
    },
  };
  capabilityRegistry.register(cap);
  return { unregister: () => capabilityRegistry.unregister(op, provider) };
}

async function callImageOp(args: Parameters<typeof handleImageOp>[0]): Promise<{
  success: boolean;
  output?: string;
  runId?: string;
  trace?: any;
  error?: string;
  available?: string[];
}> {
  const result = await handleImageOp(args);
  const text = result.content[0].text as string;
  return JSON.parse(text);
}

describe('image_op runs integration', () => {
  let tmp: TmpOutputDir;
  const fakes: Array<{ unregister: () => void }> = [];

  beforeEach(async () => {
    tmp = await withTmpOutputDir();
  });

  afterEach(async () => {
    while (fakes.length) fakes.pop()!.unregister();
    await tmp.restore();
  });

  it('success path: writes <runDir>/n1.png + manifest + user-facing copy', async () => {
    fakes.push(registerFakeCapability('extract_subject', 'fake/test-success'));
    const res = await callImageOp({
      op: 'extract_subject',
      provider: 'fake/test-success',
      params: { input: '/tmp/anything.png' },
    });

    expect(res.success).toBe(true);
    expect(res.runId).toMatch(RUN_ID_REGEX);
    expect(res.trace.runId).toBe(res.runId);
    expect(res.trace.nodes).toHaveLength(1);

    const node = res.trace.nodes[0];
    expect(node.outcome).toBe('success');
    expect(node.id).toBe('n1');
    expect(typeof node.latencyMs).toBe('number');
    expect(typeof node.durationMs).toBe('number');
    expect(typeof node.startedAtMs).toBe('number');
    expect(typeof node.endedAtMs).toBe('number');
    expect(node.artifactPath).toMatch(/\.runs\/.*\/n1\.png$/);

    const artifactExists = await fs.stat(node.artifactPath).then(() => true).catch(() => false);
    expect(artifactExists).toBe(true);

    const outputExists = await fs.stat(res.output!).then(() => true).catch(() => false);
    expect(outputExists).toBe(true);

    const runDir = path.dirname(node.artifactPath);
    const manifestRaw = await fs.readFile(path.join(runDir, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.status).toBe('success');
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.runId).toBe(res.runId);
    expect(manifest.invocation.tool).toBe('image_op');
    expect(manifest.invocation.provider).toBe('fake/test-success');
    expect(manifest.finalOutput).toBe(res.output);
  });

  it('missing capability: writes status=error manifest, no n1.png', async () => {
    const res = await callImageOp({
      op: 'extract_subject',
      provider: 'definitely-not-registered',
      params: { input: '/tmp/x.png' },
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Capability not registered');
    expect(res.runId).toMatch(RUN_ID_REGEX);
    expect(Array.isArray(res.available)).toBe(true);
    expect(res.trace?.runId).toBe(res.runId);
    expect(res.trace?.nodes[0].outcome).toBe('error');

    const runDir = path.join(tmp.dir, '.runs', res.runId!);
    const manifestRaw = await fs.readFile(path.join(runDir, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.status).toBe('error');
    expect(manifest.error).toContain('Capability not registered');

    const n1Exists = await fs.stat(path.join(runDir, 'n1.png')).then(() => true).catch(() => false);
    expect(n1Exists).toBe(false);
  });

  it('capability throws: status=error manifest, no n1.png, error in trace', async () => {
    fakes.push(registerFakeCapability('extract_subject', 'fake/test-throws', {
      throws: new Error('upstream 500'),
    }));
    const res = await callImageOp({
      op: 'extract_subject',
      provider: 'fake/test-throws',
      params: { input: '/tmp/x.png' },
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('upstream 500');
    expect(res.trace.nodes[0].outcome).toBe('error');

    const runDir = path.join(tmp.dir, '.runs', res.runId!);
    const manifest = JSON.parse(await fs.readFile(path.join(runDir, 'manifest.json'), 'utf8'));
    expect(manifest.status).toBe('error');
    const n1Exists = await fs.stat(path.join(runDir, 'n1.png')).then(() => true).catch(() => false);
    expect(n1Exists).toBe(false);
  });

  it('sweepRunArtifacts(0) deletes the run dir created by image_op', async () => {
    fakes.push(registerFakeCapability('extract_subject', 'fake/test-sweep'));
    const res = await callImageOp({
      op: 'extract_subject',
      provider: 'fake/test-sweep',
      params: { input: '/tmp/x.png' },
    });

    const runDir = path.join(tmp.dir, '.runs', res.runId!);
    const beforeExists = await fs.stat(runDir).then(() => true).catch(() => false);
    expect(beforeExists).toBe(true);
    const sweep = await sweepRunArtifacts(0);
    expect(sweep.deleted).toBeGreaterThanOrEqual(1);
    const afterExists = await fs.stat(runDir).then(() => true).catch(() => false);
    expect(afterExists).toBe(false);
  });
});
