import { Router, Request, Response } from 'express';
import * as db from '../db';

const router = Router();

/**
 * GET /api/analytics
 * Retrieves aggregated telemetry metrics and recent event streams.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // 1. Fetch raw logs first to run memory aggregation or database metrics
    const logsResult = await db.query('SELECT * FROM inference_logs ORDER BY created_at DESC LIMIT 1000;');
    const recentLogsResult = await db.query('SELECT * FROM inference_logs ORDER BY created_at DESC LIMIT 50;');
    
    const logs = logsResult.rows;
    const recentLogs = recentLogsResult.rows;

    if (logs.length === 0) {
      // Empty state returns standard schema placeholders
      return res.json({
        aggregates: {
          totalRequests: 0,
          totalTokens: 0,
          totalCost: 0,
          avgLatencyMs: 0,
          avgTps: 0,
          errorRate: 0
        },
        modelBreakdown: [],
        timeline: [],
        recentLogs: []
      });
    }

    // Programmatic metrics calculation (dual-resilient approach, works for Postgres and memory fallback)
    const totalRequests = logs.length;
    let totalTokens = 0;
    let totalCost = 0;
    let totalLatency = 0;
    let totalTps = 0;
    let totalErrors = 0;

    const modelStats: Record<string, {
      provider: string;
      model: string;
      requests: number;
      latencySum: number;
      tpsSum: number;
      costSum: number;
      errors: number;
    }> = {};

    // For plotting over time, group by hour bucket
    const timeBuckets: Record<string, {
      timestamp: string;
      requests: number;
      latencySum: number;
      tpsSum: number;
      errors: number;
    }> = {};

    for (const log of logs) {
      const isError = log.status === 'error';
      totalTokens += log.total_tokens || 0;
      totalCost += parseFloat(log.cost || 0);
      totalLatency += log.latency_ms || 0;
      totalTps += parseFloat(log.tokens_per_second || 0);
      if (isError) totalErrors++;

      // Model breakdown accumulation
      const modelKey = `${log.provider}/${log.model}`;
      if (!modelStats[modelKey]) {
        modelStats[modelKey] = {
          provider: log.provider,
          model: log.model,
          requests: 0,
          latencySum: 0,
          tpsSum: 0,
          costSum: 0,
          errors: 0
        };
      }
      modelStats[modelKey].requests++;
      modelStats[modelKey].latencySum += log.latency_ms;
      modelStats[modelKey].tpsSum += parseFloat(log.tokens_per_second || 0);
      modelStats[modelKey].costSum += parseFloat(log.cost || 0);
      if (isError) modelStats[modelKey].errors++;

      // Timeline aggregation by minute/hour (using simple date slice to fit both PG and mock dates)
      const dateObj = new Date(log.created_at);
      // Format: "YYYY-MM-DD HH:MM"
      const minutesStr = dateObj.toISOString().slice(0, 16).replace('T', ' ');
      if (!timeBuckets[minutesStr]) {
        timeBuckets[minutesStr] = {
          timestamp: minutesStr,
          requests: 0,
          latencySum: 0,
          tpsSum: 0,
          errors: 0
        };
      }
      timeBuckets[minutesStr].requests++;
      timeBuckets[minutesStr].latencySum += log.latency_ms;
      timeBuckets[minutesStr].tpsSum += parseFloat(log.tokens_per_second || 0);
      if (isError) timeBuckets[minutesStr].errors++;
    }

    // Compile aggregates
    const avgLatencyMs = Math.round(totalLatency / totalRequests);
    const avgTps = parseFloat((totalTps / totalRequests).toFixed(2));
    const errorRate = parseFloat(((totalErrors / totalRequests) * 100).toFixed(2));

    // Compile model breakdown list
    const modelBreakdown = Object.values(modelStats).map(s => ({
      provider: s.provider,
      model: s.model,
      requests: s.requests,
      avgLatencyMs: Math.round(s.latencySum / s.requests),
      avgTps: parseFloat((s.tpsSum / s.requests).toFixed(2)),
      totalCost: parseFloat(s.costSum.toFixed(6)),
      errorRate: parseFloat(((s.errors / s.requests) * 100).toFixed(2))
    }));

    // Compile timeline ordered chronologically
    const timeline = Object.values(timeBuckets)
      .map(b => ({
        timestamp: b.timestamp,
        requests: b.requests,
        latencyMs: Math.round(b.latencySum / b.requests),
        throughputTps: parseFloat((b.tpsSum / b.requests).toFixed(2)),
        errorRate: parseFloat(((b.errors / b.requests) * 100).toFixed(2))
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .slice(-30); // Take the latest 30 points for chart sizing

    res.json({
      aggregates: {
        totalRequests,
        totalTokens,
        totalCost: parseFloat(totalCost.toFixed(6)),
        avgLatencyMs,
        avgTps,
        errorRate
      },
      modelBreakdown,
      timeline,
      recentLogs
    });

  } catch (err: any) {
    console.error('[Analytics Aggregator Error]', err.message);
    res.status(500).json({ error: 'Internal analytics processor error' });
  }
});

export default router;
