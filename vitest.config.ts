import * as os from 'os';
import * as path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 10_000,
    // Eval tests write and delete EVAL_RESULTS_DIR; keep them off the real
    // eval/results the server loads at startup.
    env: { IMAGE_GEN_EVAL_RESULTS_DIR: path.join(os.tmpdir(), 'image-gen-mcp-test-eval-results') },
  },
});
