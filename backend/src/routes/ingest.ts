import { Router, Request, Response } from 'express';
import { pushLogToQueue } from '../queue/logQueue';

const router = Router();

/**
 * Real-time Ingestion Endpoint
 * Accepts raw telemetry logs from the inference SDK and submits them to the processing queue.
 */
router.post('/ingest', async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    if (!payload.conversation_id) {
      return res.status(400).json({ error: 'Missing required payload key: conversation_id' });
    }

    // Submit asynchronously to Redis event queue
    const result = await pushLogToQueue(payload);

    res.status(202).json({
      success: true,
      message: result.queued ? 'Log event accepted and queued.' : 'Log event accepted and processing directly.'
    });

  } catch (err: any) {
    console.error('[Ingestion Route Error]', err.message);
    res.status(500).json({ error: 'Internal ingestion pipeline error' });
  }
});

export default router;
