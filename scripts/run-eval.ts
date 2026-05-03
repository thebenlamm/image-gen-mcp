import { registerBuiltInCapabilities } from '../src/capabilities/register.js';
import { runEval } from '../src/eval/run.js';
import { terminatePool } from '../src/utils/ocr.js';

registerBuiltInCapabilities();
try {
  const resultPath = await runEval();
  console.log(`Eval results written to ${resultPath}`);
} finally {
  await terminatePool();
}
