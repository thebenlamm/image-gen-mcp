import { createWorker } from 'tesseract.js';

type Worker = Awaited<ReturnType<typeof createWorker>>;

const pool = new Map<string, Promise<Worker>>();

/**
 * Per-call mode: create -> recognize -> terminate. Used by eval scoring where
 * worker reuse is intentionally not a hot path.
 */
export async function recognizeOnce(path: string, lang = 'eng') {
  const worker = await createWorker(lang);
  try {
    const result = await worker.recognize(path);
    return result.data;
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

/**
 * Pooled mode: cache one worker per language for the process lifetime.
 */
export async function recognizePooled(path: string, lang = 'eng') {
  let workerPromise = pool.get(lang);
  if (!workerPromise) {
    workerPromise = createWorker(lang);
    pool.set(lang, workerPromise);
  }

  const worker = await workerPromise;
  const result = await worker.recognize(path);
  return result.data;
}

/**
 * Optional shutdown hook. Exposed for tests and future server lifecycle wiring.
 */
export async function terminatePool(): Promise<void> {
  const promises = Array.from(pool.values());
  pool.clear();

  for (const promise of promises) {
    const worker = await promise.catch(() => null);
    if (worker) {
      await worker.terminate().catch(() => undefined);
    }
  }
}
