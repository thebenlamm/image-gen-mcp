import * as crypto from 'crypto';

export const RUN_ID_REGEX =
  /^run-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{6}$/;

export function createRunId(now: Date = new Date()): string {
  const ts = now.toISOString().replace(/[:.]/g, '-');
  const rand = crypto.randomBytes(3).toString('hex');
  return `run-${ts}-${rand}`;
}
