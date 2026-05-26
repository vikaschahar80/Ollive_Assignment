import { Worker, Job } from 'bullmq';
import { getRedisConnection } from './connection';
import { InferenceLogPayload } from '../sdk/types';
import { redactPII } from '../sdk/redactor';
import * as db from '../db';
import { z } from 'zod';

const QUEUE_NAME = 'inference-telemetry-queue';
let logWorker: Worker | null = null;

// Validation Schema using Zod
const LogPayloadSchema = z.object({
  conversation_id: z.string().uuid(),
  message_id: z.string().uuid().optional(),
  provider: z.enum(['openai', 'gemini', 'mock']),
  model: z.string(),
  latency_ms: z.number().int().nonnegative(),
  prompt_tokens: z.number().int().nonnegative().default(0),
  completion_tokens: z.number().int().nonnegative().default(0),
  total_tokens: z.number().int().nonnegative().default(0),
  tokens_per_second: z.number().nonnegative().default(0),
  cost: z.number().nonnegative().default(0),
  status: z.enum(['success', 'error']),
  error_message: z.string().nullable().optional(),
  prompt_preview: z.string().default(''),
  response_preview: z.string().default(''),
  pii_redacted: z.boolean().default(false),
  ip_address: z.string().default('127.0.0.1')
});

export function initLogWorker() {
  const connection = getRedisConnection();
  
  if (!connection) {
    console.warn('[Worker] Redis not available, skipping BullMQ Worker startup. Running in Direct/Local fallback mode.');
    return;
  }

  try {
    logWorker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        const payload = job.data as InferenceLogPayload;
        await processLog(payload);
      },
      {
        connection,
        concurrency: 5, // Process up to 5 logs in parallel
      }
    );

    logWorker.on('completed', (job: Job) => {
      console.log(`[Worker] Telemetry processing completed for job ${job.id}`);
    });

    logWorker.on('failed', (job: Job | undefined, err: Error) => {
      console.error(`[Worker] Telemetry job failed ${job?.id}:`, err.message);
    });

    console.log('[Worker] Ingestion BullMQ Worker initialized.');
  } catch (err: any) {
    console.error('[Worker] Failed to initialize BullMQ Worker:', err.message);
    logWorker = null;
  }
}

/**
 * Enriches, Redacts, and Persists the telemetry log payload to the database.
 */
export async function processLog(rawPayload: InferenceLogPayload) {
  // 1. Validate incoming telemetry payload
  const validationResult = LogPayloadSchema.safeParse(rawPayload);
  
  if (!validationResult.success) {
    console.error('[Worker] Ingestion Payload Validation Failed:', validationResult.error.format());
    throw new Error('Invalid telemetry payload format');
  }

  const payload = validationResult.data;

  // 2. Perform real-time PII Redaction
  const promptRedacted = redactPII(payload.prompt_preview);
  const responseRedacted = redactPII(payload.response_preview);

  const finalPrompt = promptRedacted.redactedText;
  const finalResponse = responseRedacted.redactedText;
  const piiRedacted = payload.pii_redacted || promptRedacted.hasChanges || responseRedacted.hasChanges;

  // 3. Persist log event to PostgreSQL database
  const queryText = `
    INSERT INTO inference_logs (
      conversation_id,
      message_id,
      provider,
      model,
      latency_ms,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      tokens_per_second,
      cost,
      status,
      error_message,
      prompt_preview,
      response_preview,
      pii_redacted,
      ip_address
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING id;
  `;

  const params = [
    payload.conversation_id,
    payload.message_id || null,
    payload.provider,
    payload.model,
    payload.latency_ms,
    payload.prompt_tokens,
    payload.completion_tokens,
    payload.total_tokens,
    payload.tokens_per_second,
    payload.cost,
    payload.status,
    payload.error_message || null,
    finalPrompt,
    finalResponse,
    piiRedacted,
    payload.ip_address
  ];

  await db.query(queryText, params);
  
  if (piiRedacted) {
    console.log(`[Worker] Telemetry Log saved successfully. (PII Redacted from inputs/outputs for Convo ID: ${payload.conversation_id})`);
  } else {
    console.log(`[Worker] Telemetry Log saved successfully. (Convo ID: ${payload.conversation_id})`);
  }
}
