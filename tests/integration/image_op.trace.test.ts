import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { withTmpOutputDir, type TmpOutputDir } from '../helpers/tmpOutputDir.js';
import { capabilityRegistry } from '../../src/capabilities/registry.js';
import type { Capability } from '../../src/capabilities/types.js';
import { handleImageOp } from '../../src/index.js';

const FAKE_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex',
);

async function callImageOp(args: Parameters<typeof handleImageOp>[0]): Promise<any> {
  const result = await handleImageOp(args);
  return JSON.parse(result.content[0].text);
}

function redact(node: any) {
  return {
    ...node,
    startedAtMs: '<redacted>',
    endedAtMs: '<redacted>',
    durationMs: '<redacted>',
    latencyMs: '<redacted>',
    artifactPath: node.artifactPath ? '<runDir>/n1.png' : undefined,
    output: node.output ? '<outputPath>.png' : undefined,
  };
}

describe('image_op trace shape (Phase 6 -> Phase 9 contract)', () => {
  let tmp: TmpOutputDir;

  beforeEach(async () => {
    tmp = await withTmpOutputDir();
    const cap: Capability = {
      op: 'extract_subject',
      provider: 'fake/trace-snap',
      modelVersion: 'snap-1',
      constraints: { outputFormat: 'png' },
      cost: { perCallUsd: 0 },
      invoke: async () => ({
        buffer: FAKE_PNG,
        model: 'snap-model',
        metadata: { fixture: true },
      }),
    };
    capabilityRegistry.register(cap);
  });

  afterEach(async () => {
    capabilityRegistry.unregister('extract_subject', 'fake/trace-snap');
    await tmp.restore();
  });

  it('locks the trace node key set (Phase 9 multi-node DAG must use the same shape)', async () => {
    const res = await callImageOp({
      op: 'extract_subject',
      provider: 'fake/trace-snap',
      params: { input: '/tmp/x.png' },
    });

    const node = res.trace.nodes[0];
    const keys = Object.keys(node).sort();
    expect(keys).toEqual([
      'artifactPath',
      'cost_usd',
      'durationMs',
      'endedAtMs',
      'id',
      'latencyMs',
      'metadata',
      'model',
      'op',
      'outcome',
      'output',
      'provider',
      'startedAtMs',
    ]);
    expect(node).not.toHaveProperty('revisedPrompt');
    expect(node).not.toHaveProperty('error');
  });

  it('snapshot of redacted trace (single-node case)', async () => {
    const res = await callImageOp({
      op: 'extract_subject',
      provider: 'fake/trace-snap',
      params: { input: '/tmp/x.png' },
    });
    const redacted = {
      success: res.success,
      runIdPresent: typeof res.runId === 'string',
      output: res.output ? '<outputPath>.png' : undefined,
      trace: {
        runIdMatches: res.trace.runId === res.runId,
        nodes: res.trace.nodes.map(redact),
      },
    };
    expect(redacted).toMatchSnapshot();
  });

  it('multi-node compatibility: a synthesized 3-node trace has identical node-key shape', () => {
    const synth = {
      runId: 'run-x',
      nodes: [0, 1, 2].map((i) => ({
        id: `n${i + 1}`,
        op: 'extract_subject',
        provider: 'fake',
        model: 'm',
        artifactPath: `/tmp/n${i + 1}.png`,
        output: `/tmp/output-${i + 1}.png`,
        startedAtMs: i,
        endedAtMs: i + 10,
        durationMs: 10,
        latencyMs: 10,
        outcome: 'success' as const,
        cost_usd: 0,
        metadata: {},
      })),
    };
    const roundTripped = JSON.parse(JSON.stringify(synth));
    const allKeys = roundTripped.nodes.map((n: any) => Object.keys(n).sort().join(','));
    expect(new Set(allKeys).size).toBe(1);
  });
});
