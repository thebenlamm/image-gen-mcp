import { registerBuiltInCapabilities } from '../src/capabilities/register.js';
import { runEval } from '../src/eval/run.js';

registerBuiltInCapabilities();
const resultPath = await runEval();
console.log(`Eval results written to ${resultPath}`);
