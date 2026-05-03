import { describe, expect, it } from 'vitest';
import { handleListCapabilities } from '../../src/index.js';

describe('list_capabilities integration', () => {
  it('returns registered capability metadata without invoke functions', async () => {
    const result = await handleListCapabilities();
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.capabilities.length).toBeGreaterThanOrEqual(4);
    for (const entry of parsed.capabilities) {
      expect(entry).toHaveProperty('op');
      expect(entry).toHaveProperty('provider');
      expect(entry).toHaveProperty('modelVersion');
      expect(entry).toHaveProperty('constraints');
      expect(entry).toHaveProperty('cost');
      expect(Object.keys(entry)).not.toContain('invoke');
    }
  });
});
