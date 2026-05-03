import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '../../src/capabilities/registry.js';
import type { Capability, CapabilityOp } from '../../src/capabilities/types.js';

function capability(
  provider: string,
  options: {
    op?: CapabilityOp;
    modelVersion?: string;
    scores?: Record<string, number>;
    unscoredJustification?: string;
  } = {},
): Capability {
  return {
    op: options.op ?? 'extract_subject',
    provider,
    modelVersion: options.modelVersion ?? 'model-v1',
    constraints: { outputFormat: 'png' },
    cost: { perCallUsd: 0 },
    quality: options.scores || Object.prototype.hasOwnProperty.call(options, 'unscoredJustification')
      ? {
          ...(options.scores ? { scores: options.scores } : {}),
          ...(Object.prototype.hasOwnProperty.call(options, 'unscoredJustification')
            ? { unscoredJustification: options.unscoredJustification }
            : {}),
        }
      : undefined,
    invoke: async () => ({ kind: 'image' as const, buffer: Buffer.alloc(0), model: 'fake-model' }),
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

    registry.register(capability('provider-b', {
      scores: undefined,
      unscoredJustification: 'intentional local capability without deterministic scorer',
    }), { allowUnscoredProduction: true });

    expect(registry.get('extract_subject', 'provider-b')).toBeDefined();
  });

  it('rejects explicit unscored production registrations without justification', () => {
    const registry = new CapabilityRegistry();
    registry.register(capability('provider-a'));

    expect(() =>
      registry.register(capability('provider-b'), { allowUnscoredProduction: true }),
    ).toThrow(/unscoredJustification/);
  });

  it('allows explicit unscored production registrations with justification', () => {
    const registry = new CapabilityRegistry();
    registry.register(capability('provider-a'));

    registry.register(capability('provider-b', {
      unscoredJustification: 'provider intentionally unscored in this phase',
    }), { allowUnscoredProduction: true });

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
      unscoredJustification: 'model changed; quality invalidation intentionally bypassed',
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

describe('Phase 11 second-provider gate', () => {
  const scenarios = [
    { op: 'extract_subject' as const, incumbent: 'fake-imgly', second: 'photoroom' },
    { op: 'composite_layers' as const, incumbent: 'fake-sharp', second: 'photoroom' },
    { op: 'edit_prompt' as const, incumbent: 'fake-openai', second: 'fal' },
  ];

  for (const scenario of scenarios) {
    it(`rejects unscored ${scenario.op}/${scenario.second} without explicit bypass`, () => {
      const registry = new CapabilityRegistry();
      registry.register(capability(scenario.incumbent, { op: scenario.op }));

      expect(() => registry.register(capability(scenario.second, { op: scenario.op }))).toThrow(/unscored/);
    });

    it(`rejects ${scenario.op}/${scenario.second} bypass with empty justification`, () => {
      const registry = new CapabilityRegistry();
      registry.register(capability(scenario.incumbent, { op: scenario.op }));

      expect(() =>
        registry.register(capability(scenario.second, {
          op: scenario.op,
          unscoredJustification: '',
        }), { allowUnscoredProduction: true }),
      ).toThrow(/unscoredJustification/);
    });

    it(`allows ${scenario.op}/${scenario.second} bypass with justification`, () => {
      const registry = new CapabilityRegistry();
      registry.register(capability(scenario.incumbent, { op: scenario.op }));

      registry.register(capability(scenario.second, {
        op: scenario.op,
        unscoredJustification: 'Phase 11 eval scores pending',
      }), { allowUnscoredProduction: true });

      expect(registry.get(scenario.op, scenario.second)).toBeDefined();
    });
  }
});
