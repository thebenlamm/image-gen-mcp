import * as fs from 'fs/promises';
import { describe, expect, it } from 'vitest';

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
});
