import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '../../src/capabilities/registry.js';
import type { Capability, CapabilityOp } from '../../src/capabilities/types.js';

function capability(
  provider: string,
  options: {
    op?: CapabilityOp;
    modelVersion?: string;
    scores?: Record<string, number>;
  } = {},
): Capability {
  return {
    op: options.op ?? 'extract_subject',
    provider,
    modelVersion: options.modelVersion ?? 'model-v1',
    constraints: { outputFormat: 'png' },
    cost: { perCallUsd: 0 },
    quality: options.scores ? { scores: options.scores } : undefined,
    invoke: async () => ({ buffer: Buffer.alloc(0), model: 'fake-model' }),
  };
}

describe('CapabilityRegistry quality guardrails', () => {
  it('allows the first provider for an op to register without quality scores', () => {
    const registry = new CapabilityRegistry();

    registry.register(capability('provider-a'));

    expect(registry.get('extract_subject', 'provider-a')).toBeDefined();
  });

  it('rejects an unscored second provider for the same op by default', () => {
    const registry = new CapabilityRegistry();
    registry.register(capability('provider-a'));

    expect(() => registry.register(capability('provider-b'))).toThrow(/unscored/);
  });

  it('allows a scored second provider for the same op', () => {
    const registry = new CapabilityRegistry();
    registry.register(capability('provider-a'));

    registry.register(capability('provider-b', { scores: { alpha_coverage: 0.8 } }));

    expect(registry.get('extract_subject', 'provider-b')?.quality?.scores).toEqual({
      alpha_coverage: 0.8,
    });
  });

  it('allows explicit unscored non-production registrations', () => {
    const registry = new CapabilityRegistry();
    registry.register(capability('provider-a'));

    registry.register(capability('provider-b'), { allowUnscoredProduction: true });

    expect(registry.get('extract_subject', 'provider-b')).toBeDefined();
  });

  it('invalidates quality on model changes and blocks stale second-provider routing', () => {
    const registry = new CapabilityRegistry();
    registry.register(capability('provider-a'));
    registry.register(capability('provider-b', { scores: { alpha_coverage: 0.8 } }));

    expect(() =>
      registry.register(capability('provider-b', {
        modelVersion: 'model-v2',
        scores: { alpha_coverage: 0.9 },
      })),
    ).toThrow(/unscored/);

    registry.register(capability('provider-b', {
      modelVersion: 'model-v2',
      scores: { alpha_coverage: 0.9 },
    }), { allowUnscoredProduction: true });

    expect(registry.get('extract_subject', 'provider-b')?.quality).toBeUndefined();
  });

  it('lists only scored capabilities for an op', () => {
    const registry = new CapabilityRegistry();
    registry.register(capability('provider-a'));
    registry.register(capability('provider-b', { scores: { alpha_coverage: 0.8 } }));

    expect(registry.listScored('extract_subject').map((entry) => entry.provider)).toEqual([
      'provider-b',
    ]);
  });
});
