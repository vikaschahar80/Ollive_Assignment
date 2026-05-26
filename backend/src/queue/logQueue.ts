import { Queue } from 'bullmq';
import { getRedisConnection, checkRedisConnection } from './connection';
import { InferenceLogPayload } from '../sdk/types';
import { processLog } from './logWorker'; // direct backup processor

const QUEUE_NAME = 'inference-telemetry-queue';
let logQueue: Queue | null = null;

export function initLogQueue() {
  const connection = getRedisConnection();
  
  if (!connection) {
    console.warn('[Queue] Redis not available, running in Local-Async Fallback queue mode.');
    return;
  }

  try {
    logQueue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        removeOnComplete: true,
        removeOnFail: false
      }
    });
    console.log('[Queue] Ingestion BullMQ initialized successfully.');
  } catch (err: any) {
    console.warn('[Queue] Failed to initialize BullMQ queue, falling back to Local-Async:', err.message);
    logQueue = null;
  }
}

/**
 * Pushes log payload to BullMQ queue, or processes directly if Redis is not available
 */
export async function pushLogToQueue(payload: InferenceLogPayload) {
  if (logQueue && checkRedisConnection()) {
    try {
      await logQueue.add('telemetry-job', payload);
      return { success: true, queued: true };
    } catch (err: any) {
      console.warn('[Queue] BullMQ push failed, falling back to direct database write:', err.message);
    }
  }

  // Fallback direct execution in a separate async execution block
  setTimeout(async () => {
    try {
      await processLog(payload);
    } catch (err: any) {
      console.error('[Queue Fallback] Failed to direct-write telemetry log:', err.message);
    }
  }, 0);

  return { success: true, queued: false };
}
