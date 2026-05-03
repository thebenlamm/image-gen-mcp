import * as fs from 'fs/promises';
import * as path from 'path';
import type { EvalFixture } from './types.js';

export const FIXTURE_ROOT = path.resolve('eval/fixtures');

const MANIFEST_PATH = path.join(FIXTURE_ROOT, 'manifest.json');
const REQUIRED_CATEGORIES = new Set<EvalFixture['category']>([
  'product',
  'person',
  'text-heavy',
  'transparent-edge',
  'low-contrast',
]);

function isFixture(value: unknown): value is EvalFixture {
  const fixture = value as EvalFixture;
  return (
    typeof fixture?.id === 'string' &&
    typeof fixture.path === 'string' &&
    REQUIRED_CATEGORIES.has(fixture.category) &&
    Array.isArray(fixture.tags) &&
    fixture.tags.every((tag) => typeof tag === 'string') &&
    typeof fixture.description === 'string'
  );
}

function resolveFixturePath(fixturePath: string): string {
  if (path.isAbsolute(fixturePath) || fixturePath.split(/[\\/]+/).includes('..')) {
    throw new Error(`Invalid fixture path: ${fixturePath}`);
  }

  const resolved = path.resolve(FIXTURE_ROOT, fixturePath);
  const relative = path.relative(FIXTURE_ROOT, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Fixture path escapes fixture root: ${fixturePath}`);
  }

  return resolved;
}

export async function loadFixtures(): Promise<EvalFixture[]> {
  const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('Fixture manifest must be an array');
  }

  if (parsed.length !== 12) {
    throw new Error(`Fixture manifest must contain exactly 12 entries, found ${parsed.length}`);
  }

  const categories = new Set<EvalFixture['category']>();
  const fixtures: EvalFixture[] = [];

  for (const entry of parsed) {
    if (!isFixture(entry)) {
      throw new Error('Fixture manifest contains an invalid entry');
    }

    const resolvedPath = resolveFixturePath(entry.path);
    if (path.extname(resolvedPath) !== '.png') {
      throw new Error(`Fixture must be a .png file: ${entry.path}`);
    }

    await fs.access(resolvedPath);
    categories.add(entry.category);
    fixtures.push({ ...entry, path: resolvedPath });
  }

  for (const category of REQUIRED_CATEGORIES) {
    if (!categories.has(category)) {
      throw new Error(`Fixture manifest missing category: ${category}`);
    }
  }

  return fixtures;
}
