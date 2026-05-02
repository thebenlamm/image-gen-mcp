import * as fs from 'fs/promises';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { loadFixtures } from '../../src/eval/fixtures.js';

describe('fixture manifest', () => {
  it('defines the golden fixture catalog', async () => {
    const raw = await fs.readFile('eval/fixtures/manifest.json', 'utf8');
    const fixtures = JSON.parse(raw) as Array<{ id: string; category: string }>;

    expect(fixtures).toHaveLength(10);
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(10);
    expect(new Set(fixtures.map((fixture) => fixture.category))).toEqual(
      new Set(['product', 'person', 'text-heavy', 'transparent-edge', 'low-contrast'])
    );
  });

  it('loads existing PNG fixture files', async () => {
    const fixtures = await loadFixtures();

    expect(fixtures).toHaveLength(10);
    for (const fixture of fixtures) {
      await expect(fs.access(fixture.path)).resolves.toBeUndefined();
      const metadata = await sharp(fixture.path).metadata();
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);
    }
  });
});
