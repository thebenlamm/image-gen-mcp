import { createWorker } from 'tesseract.js';

type Worker = Awaited<ReturnType<typeof createWorker>>;
type WorkerParameters = Parameters<Worker['setParameters']>[0];

const pool = new Map<string, Promise<Worker>>();
const queues = new Map<string, Promise<unknown>>();

/**
 * Per-call mode: create -> recognize -> terminate. Used by eval scoring where
 * worker reuse is intentionally not a hot path.
 */
export async function recognizeOnce(path: string, lang = 'eng', parameters?: WorkerParameters) {
  const worker = await createWorker(lang);
  try {
    if (parameters) {
      await worker.setParameters(parameters);
    }
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
    workerPromise = createWorker(lang).catch((error) => {
      pool.delete(lang);
      throw error;
    });
    pool.set(lang, workerPromise);
  }

  const previous = queues.get(lang) ?? Promise.resolve();
  const next = previous.then(async () => {
    const worker = await workerPromise;
    const result = await worker.recognize(path);
    return result.data;
  });
  queues.set(lang, next.catch(() => undefined));
  return next;
}

/**
 * Optional shutdown hook. Exposed for tests and future server lifecycle wiring.
 */
export async function terminatePool(): Promise<void> {
  const promises = Array.from(pool.values());
  pool.clear();
  queues.clear();

  for (const promise of promises) {
    const worker = await promise.catch(() => null);
    if (worker) {
      await worker.terminate().catch(() => undefined);
    }
  }
}
