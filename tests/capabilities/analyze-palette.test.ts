import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { CapabilityInvokeError } from '../../src/capabilities/types.js';
import { createAnalyzePaletteCapability } from '../../src/capabilities/analyze-palette.js';

const INPUT = path.resolve('eval/fixtures/palette-three-bands.png');

describe('analyze_palette capability', () => {
  it('returns weighted colors sorted descending', async () => {
    const capability = createAnalyzePaletteCapability();

    const result = await capability.invoke({ params: { input: INPUT, count: 3 } });

    expect(result.kind).toBe('data');
    if (result.kind !== 'data' || result.data.type !== 'palette') {
      throw new Error('expected palette data result');
    }
    expect(result.data.colors).toHaveLength(3);
    expect(result.data.colors.map((color) => color.hex).sort()).toEqual([
      '#0000ff',
      '#00ff00',
      '#ff0000',
    ]);
    expect(result.data.colors[0].weight).toBeGreaterThanOrEqual(result.data.colors[1].weight);
    const totalWeight = result.data.colors.reduce((sum, color) => sum + color.weight, 0);
    expect(totalWeight).toBeGreaterThan(0.95);
    expect(totalWeight).toBeLessThan(1.05);
  });

  it('honors count=1', async () => {
    const capability = createAnalyzePaletteCapability();

    const result = await capability.invoke({ params: { input: INPUT, count: 1 } });

    expect(result.kind).toBe('data');
    if (result.kind !== 'data' || result.data.type !== 'palette') {
      throw new Error('expected palette data result');
    }
    expect(result.data.colors).toHaveLength(1);
  });

  it('rejects counts outside 1-16', async () => {
    const capability = createAnalyzePaletteCapability();

    await expect(capability.invoke({ params: { input: INPUT, count: 0 } })).rejects.toBeInstanceOf(
      CapabilityInvokeError,
    );
    await expect(capability.invoke({ params: { input: INPUT, count: 17 } })).rejects.toMatchObject({
      code: 'CONSTRAINT_VIOLATION',
    });
  });
});
