import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerBuiltInCapabilities } from '../../src/capabilities/register.js';
import { capabilityRegistry } from '../../src/capabilities/registry.js';

const ENV_KEYS = [
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'XAI_API_KEY',
  'REPLICATE_API_TOKEN',
  'TOGETHER_API_KEY',
  'IDEOGRAM_API_KEY',
];

const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    original[key] = process.env[key];
    process.env[key] = 'test-key';
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original[key];
    }
  }
});

describe('registerBuiltInCapabilities smoke test', () => {
  it('does not throw when all provider API keys are present', () => {
    expect(() => registerBuiltInCapabilities()).not.toThrow();
  });

  it('registers all 6 generate providers (ROUTE-01)', () => {
    registerBuiltInCapabilities();
    const providers = ['ideogram', 'openai', 'gemini', 'grok', 'replicate', 'together'];
    for (const provider of providers) {
      expect(
        capabilityRegistry.get('generate', provider),
        `expected capabilityRegistry.get('generate', '${provider}') to be defined`,
      ).toBeDefined();
    }
  });

  it('every generate capability exposes cost.perCallUsd, latencyMsP50, constraints, and quality.unscoredJustification (ROUTE-02)', () => {
    registerBuiltInCapabilities();
    const generateCaps = capabilityRegistry.list('generate');
    expect(generateCaps.length).toBeGreaterThanOrEqual(6);
    for (const cap of generateCaps) {
      expect(typeof cap.cost.perCallUsd, `${cap.provider}.cost.perCallUsd`).toBe('number');
      expect(typeof cap.latencyMsP50, `${cap.provider}.latencyMsP50`).toBe('number');
      expect(cap.constraints, `${cap.provider}.constraints`).toBeDefined();
      expect(cap.constraints.supportedSizes, `${cap.provider}.constraints.supportedSizes`).toEqual(
        expect.arrayContaining(['square', 'landscape', 'portrait']),
      );
      const justification = cap.quality?.unscoredJustification ?? '';
      expect(justification.length, `${cap.provider} quality.unscoredJustification must be non-empty`).toBeGreaterThan(0);
    }
  });

  it('planner-facing capability snapshot (registry.list()) includes all 6 generate providers (ROUTE-03)', () => {
    registerBuiltInCapabilities();
    const snapshot = capabilityRegistry.list().map((c) => `${c.op}:${c.provider}`);
    const expected = [
      'generate:ideogram',
      'generate:openai',
      'generate:gemini',
      'generate:grok',
      'generate:replicate',
      'generate:together',
    ];
    for (const key of expected) {
      expect(snapshot, `snapshot should contain ${key}`).toContain(key);
    }
  });
});
