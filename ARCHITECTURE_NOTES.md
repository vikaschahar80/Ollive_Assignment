# Ollive Inference Ingestion: Architecture & Systems Blueprint 🚀

This document details the architectural decisions, data flow pathways, scaling models, and failure-handling assumptions built into the **Ollive Inference Logging and Ingestion System**.

---

## 🌊 1. End-to-End Ingestion Flow

The pipeline operates on a completely decoupled, asynchronous, event-driven pattern to ensure that monitoring overhead never degrades the core LLM user experience:

```
[User Chat Screen] 
       │ (1. SSE Stream Request)
       ▼
[Express Chat API Gateway] 
       │ (2. Resolves History & Initiates LLM)
       ▼
[Inference Telemetry SDK Wrapper] ────► [Generative AI Endpoint] (3. Streaming Response)
       │ (4. Compiles Metrics & Cost)
       ▼
[Ingestion API Route: POST /api/ingest]
       │ (5. Validates with Zod Schemas)
       ▼
[Redis Event Queue (BullMQ)]
       │ (6. Asynchronous Dequeue by Worker)
       ▼
[PII Redactor Engine]
       │ (7. Sanitizes credit cards, SSNs, phone numbers, emails)
       ▼
[PostgreSQL Database Storage] ◄──── [Analytics Dashboard UI] (8. Aggregates data & charts)
```

### Flow Step-by-Step:
1. **User Request**: The user submits a prompt via the glassmorphic React interface.
2. **Gateway Interception**: The Express Chat router (`/api/conversations/:id/chat`) resolves the last 10 messages from PostgreSQL to maintain short conversational context and starts the stream.
3. **SDK Wrapper Execution**: The custom SDK wraps the call, tracking precise performance metrics (latency, input/output tokens, cost parameters) under both standard and streaming models.
4. **Asynchronous telemetries dispatch**: The moment the completion finishes (or is aborted by a cancellation), the SDK dispatches the telemetry JSON payload to `/api/ingest` in a background **fire-and-forget** promise chain.
5. **Ingestion validation**: The Ingest Router parses the JSON payload against strict **Zod schemas**.
6. **Queue Buffering**: The payload is pushed to **BullMQ** (powered by Redis). The router immediately returns a `202 Accepted` status, decoupling logging from active socket connections.
7. **Worker Processing & Sanitization**: The background BullMQ worker picks up the job, runs the prompt/output texts through the **PII Redaction engine**, and estimates cost metrics.
8. **Relational Persistence**: The fully processed, sanitized record is written to **PostgreSQL**. The metrics instantly propagate to the SVG Timeline charts on the React dashboard.

---

## 📈 2. Logging Strategy

### Asynchronous Telemetry Delivery
Logs are submitted as non-blocking background tasks. The Express server immediately accepts the payload, leaving the client conversation thread unencumbered by database read/write locks.

### Streaming Observability (TTFT & Throughput)
Measuring latency on streaming completions is a classic engineering challenge. Our SDK wraps the streaming chunks, tracking two critical timestamps:
* **Time-to-First-Token (TTFT)**: Elapsed milliseconds from prompt submit to the arrival of the first character chunk.
* **Overall Completion Latency**: Total elapsed milliseconds to stream conclusion.
* **Throughput Speed**: Exact tokens-per-second generated:
  $$\text{Throughput} = \frac{\text{Completion Tokens}}{\text{Latency in Seconds}}$$
* **Billing Aggregations**: Costs are calculated on completion against exact token weights and static model cost factors (GPT, LLaMA, and Gemini tiers).

---

## 🚀 3. Scaling Considerations

### Redis Log Buffering
Writing telemetry directly to a relational database under heavy traffic (e.g. thousands of chat completions per second) will lock your tables. Placing a **Redis-backed BullMQ Queue** in front of PostgreSQL acts as a pressure valve:
- During spikes, logs pile up in Redis’s fast memory space.
- The **BullMQ Worker** processes writes concurrently at a steady, controlled rate (defaulting to 5 concurrent writes in the worker pool), shielding your PostgreSQL database from connection crashes.

### Database Index Optimizations
To support rapid dashboard aggregation over millions of trace events without table scans, indexes are explicitly declared on `created_at DESC`, `status`, and `(provider, model)` compound keys inside `schema.sql`.

### Multi-Replica Gateway Deployment
In the provided **Kubernetes configuration (`k8s/ollive-telemetry.yaml`)**, the frontend and ingestion backend deployments utilize a **2-replica horizontal pod autoscaling blueprint**, allowing Kubernetes to distribute incoming API/Ingestion traffic across active pods behind a cluster load balancer.

---

## 🛡️ 4. Failure Handling & Resiliency Assumptions

### Dual-Resiliency Fallback Pipeline
In real-world development, databases or caches go offline. Our system is built with active local fallbacks to guarantee **zero start-up crashes**:
- **Offline Redis Fallback**: If Redis is offline, the SDK connection manager fails fast (1.5-second timeout), skips BullMQ initialization, and automatically routes telemetry logs to a local asynchronous `setTimeout` queue.
- **Offline Postgres Fallback**: If your PostgreSQL server is offline, the database client automatically spins up an in-memory database simulator. Chat sessions, histories, and dashboard timeline aggregations run cleanly in-memory!

### Stream Connection Cancellations
If a user clicks **"Cancel Generation"** mid-flight:
1. The frontend cancels its connection socket using an **AbortController**.
2. The Express backend catches the connection drop (`req.on('close')`) and terminates the OpenAI/Gemini stream.
3. The SDK captures the partial text streamed so far, tags it with `[CANCELLED BY USER]`, and dispatches it as a completed telemetry log event to the ingestion pipeline. **No tokens are lost, and all partial costs are accurately tracked.**

### Event Queue Retries
Inside the BullMQ worker configuration, if a log insert fails (e.g., due to a temporary database lock), the event queue automatically schedules **exponential backoff retries** (up to 3 times, starting at 1 second) before marking the telemetry job as failed.
