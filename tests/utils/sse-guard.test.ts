import { describe, it, expect, vi } from 'vitest';
import { createLoopbackGuard } from '../../src/sse-guard.js';

function run(headers: Record<string, string | undefined>) {
  const guard = createLoopbackGuard(3101);
  const res = { statusCode: 200, status(c: number) { this.statusCode = c; return this; }, json: vi.fn() };
  const next = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  guard({ headers, method: 'GET', path: '/sse' } as never, res as never, next);
  return { status: res.statusCode, passed: next.mock.calls.length === 1 };
}

describe('SSE loopback guard', () => {
  it('allows loopback Host with no Origin (CLI MCP client)', () => {
    expect(run({ host: '127.0.0.1:3101' })).toEqual({ status: 200, passed: true });
    expect(run({ host: 'localhost:3101' })).toEqual({ status: 200, passed: true });
  });
  it('allows loopback Origin', () => {
    expect(run({ host: 'localhost:3101', origin: 'http://localhost:3101' }).passed).toBe(true);
  });
  it('rejects DNS-rebinding Host', () => {
    expect(run({ host: 'attacker.example:3101' })).toEqual({ status: 403, passed: false });
  });
  it('rejects missing Host', () => {
    expect(run({})).toEqual({ status: 403, passed: false });
  });
  it('rejects loopback Host on wrong port', () => {
    expect(run({ host: '127.0.0.1:80' }).passed).toBe(false);
  });
  it('rejects foreign Origin even with loopback Host', () => {
    expect(run({ host: '127.0.0.1:3101', origin: 'https://evil.example' })).toEqual({ status: 403, passed: false });
  });
});
