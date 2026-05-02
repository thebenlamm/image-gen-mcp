import { describe, it, expect } from 'vitest';
import { createRunId, RUN_ID_REGEX } from '../../src/runs/id.js';

describe('createRunId', () => {
  it('matches the expected format', () => {
    expect(createRunId()).toMatch(RUN_ID_REGEX);
  });

  it('produces 1000 unique ids in a tight loop', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i += 1) ids.add(createRunId());
    expect(ids.size).toBe(1000);
  });

  it('is deterministic in the timestamp portion for a fixed Date', () => {
    const fixed = new Date('2026-05-01T12:34:56.789Z');
    const a = createRunId(fixed);
    const b = createRunId(fixed);
    const stripTail = (s: string) => s.slice(0, s.length - 6);

    expect(stripTail(a)).toBe(stripTail(b));
    expect(a).not.toBe(b);
  });
});
