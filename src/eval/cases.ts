import * as fs from 'fs/promises';
import * as path from 'path';
import type { EvalCase } from './types.js';
import { loadFixtures } from './fixtures.js';

const CASES_ROOT = path.resolve('eval/cases');

function isEvalCase(value: unknown): value is EvalCase {
  const evalCase = value as EvalCase;
  return (
    typeof evalCase?.id === 'string' &&
    typeof evalCase.op === 'string' &&
    typeof evalCase.provider === 'string' &&
    typeof evalCase.fixtureId === 'string' &&
    typeof evalCase.params === 'object' &&
    evalCase.params !== null &&
    Array.isArray(evalCase.scorers) &&
    evalCase.scorers.every((scorer) => typeof scorer === 'string') &&
    (evalCase.requiredEnv === undefined ||
      (Array.isArray(evalCase.requiredEnv) &&
        evalCase.requiredEnv.every((envName) => typeof envName === 'string')))
  );
}

export async function loadEvalCases(): Promise<EvalCase[]> {
  const fixtures = await loadFixtures();
  const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const entries = await fs.readdir(CASES_ROOT);
  const caseFiles = entries.filter((entry) => entry.endsWith('.json')).sort();
  const cases: EvalCase[] = [];

  for (const file of caseFiles) {
    const raw = await fs.readFile(path.join(CASES_ROOT, file), 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error(`Eval case file must contain an array: ${file}`);
    }

    for (const entry of parsed) {
      if (!isEvalCase(entry)) {
        throw new Error(`Eval case file contains an invalid case: ${file}`);
      }

      const fixture = fixturesById.get(entry.fixtureId);
      if (!fixture) {
        throw new Error(`Eval case references unknown fixture id: ${entry.fixtureId}`);
      }

      const params = { ...entry.params };
      if (params.input === '${fixture.path}') {
        params.input = fixture.path;
      }

      cases.push({ ...entry, params });
    }
  }

  return cases;
}
