import sharp from 'sharp';

/**
 * Maximum libvips threads used by sharp across the whole process.
 * Capped at 2 to bound memory under parallel DAG execution.
 */
export const SHARP_CONCURRENCY_LIMIT = 2;

/**
 * Maximum number of DAG nodes the executor runs in parallel.
 * Kept aligned with SHARP_CONCURRENCY_LIMIT to bound libvips contention.
 */
export const MAX_PARALLEL_NODES = 2;

sharp.concurrency(2);
