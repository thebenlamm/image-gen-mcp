import { registerBuiltInCapabilities } from '../src/capabilities/register.js';
import { EvalFailedError, runEval } from '../src/eval/run.js';
import { terminatePool } from '../src/utils/ocr.js';

registerBuiltInCapabilities();
try {
  const resultPath = await runEval();
  console.log(`Eval results written to ${resultPath}`);
} catch (error) {
  if (error instanceof EvalFailedError) {
    console.error(`Eval failed: ${error.failed.length} case(s) did not pass.`);
    for (const result of error.failed) {
      console.error(`- ${result.caseId} (${result.op}:${result.provider}): ${result.error ?? 'unknown error'}`);
    }
    console.error(`Result JSON: ${error.resultPath}`);
    process.exitCode = 1;
  } else {
    console.error(`Eval failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
} finally {
  await terminatePool();
}
