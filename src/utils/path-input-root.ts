import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export class InputRootViolation extends Error {
  constructor(
    public readonly inputPath: string,
    public readonly root: string,
    message: string,
  ) {
    super(message);
    this.name = 'InputRootViolation';
  }
}

function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

export async function assertWithinInputRoot(inputPath: string): Promise<void> {
  const configuredRoot = process.env.IMAGE_GEN_INPUT_ROOT;
  if (!configuredRoot?.trim()) {
    return;
  }

  const expanded = expandTilde(inputPath);
  const resolved = path.resolve(expanded);
  const rootResolved = path.resolve(expandTilde(configuredRoot));

  let rootReal: string;
  try {
    rootReal = await fs.realpath(rootResolved);
  } catch (error) {
    throw new InputRootViolation(
      inputPath,
      rootResolved,
      `IMAGE_GEN_INPUT_ROOT does not exist or cannot be resolved: ${rootResolved}`,
    );
  }

  let inputReal: string;
  try {
    inputReal = await fs.realpath(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Plan validation can see future node artifact paths before the executor creates them.
      const rootResolvedWithSep = rootResolved.endsWith(path.sep)
        ? rootResolved
        : rootResolved + path.sep;
      if (resolved === rootResolved || resolved.startsWith(rootResolvedWithSep)) {
        inputReal = path.join(rootReal, path.relative(rootResolved, resolved));
      } else {
        inputReal = resolved;
      }
    } else {
      throw new InputRootViolation(
        inputPath,
        rootReal,
        `Input path cannot be resolved under IMAGE_GEN_INPUT_ROOT: ${inputPath}`,
      );
    }
  }

  const rootWithSep = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;
  if (inputReal !== rootReal && !inputReal.startsWith(rootWithSep)) {
    throw new InputRootViolation(
      inputPath,
      rootReal,
      `Input path resolves outside IMAGE_GEN_INPUT_ROOT: ${inputPath}`,
    );
  }
}
