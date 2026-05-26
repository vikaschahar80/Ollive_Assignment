# Ollive Inference Logging & Ingestion System 🚀

A highly resilient, near real-time LLM inference telemetry logging and ingestion pipeline. This project comprises a multi-provider, streaming-enabled Chatbot interface, a real-time performance analytics dashboard, an asynchronous ingestion backend powered by Redis and BullMQ, and PostgreSQL storage.

---

## 🏗️ Architecture Overview

The system is built as a highly decoupled, event-driven microservices architecture:

```
                  ┌──────────────────────┐
                  │   Vite + React UI    │
                  │   (Nginx Port 3000)  │
                  └──────────┬───────────┘
                             │
                  ┌──────────▼───────────┐
                  │ Express Chat & API   │◀─────────┐
                  │      (Port 5001)     │          │
                  └────┬────────────┬────┘          │
                       │            │               │
            [Inference SDK]     [HTTP Ingest]       │
                       │            │               │
        ┌──────────────▼─┐    ┌─────▼──────────┐    │
        │ LLM API CALL   │    │  BullMQ Queue  │    │
        │ OpenAI/Gemini  │    │ (Redis Port 6379)   │
        └──────────────┬─┘    └─────┬──────────┘    │
                       │            │               │
                       │     ┌──────▼──────────┐    │
                       │     │  BullMQ Worker  │    │
                       │     └──────┬──────────┘    │
                       │            │               │
                       │      [PII Redactor]        │
                       │            │               │
                       └────────────┼───────────────┘
                                    │
                         ┌──────────▼───────────┐
                         │ PostgreSQL Database  │
                         │     (Port 5432)      │
                         └──────────────────────┘
```

1. **Frontend (Vite + React SPA)**: Hosted inside Nginx on Port 3000. Provides:
   - **Multi-Turn Chat Client**: Interactive model and provider switching, with mid-stream AbortController cancellation triggers.
   - **Performance Telemetry Dashboard**: Complete visual grids of total traces, throughput, latency timelines, and billing costs constructed via a custom **responsive SVG charting engine** (guaranteeing zero NPM peer-dependency failures).
   - **Live Ingestion Log Stream**: The last 50 SDK trace events updating in real-time.
2. **Backend Services (Express + Node + TypeScript)**: Hosted on Port 5001. Handles conversation state records and logs processing.
3. **Telemetry Ingest SDK (TypeScript)**: Integrates directly inside the LLM pathway. It wraps OpenAI and Gemini models, tracks input/output usage, computes latency and dollar cost parameters, and dispatches JSON events to the `/api/ingest` pipeline asynchronously to prevent UI blockages.
4. **Asynchronous Log Buffer (Redis + BullMQ)**: Log payloads submitted to the ingestion pipeline are validated (using Zod) and instantly placed in Redis.
5. **Ingestion Worker Engine**: BullMQ Workers ingest logs, parse metadata (calculating precise throughput/tokens-per-second metrics), execute **PII Redaction algorithms** (scrubbing credit cards, phone numbers, emails, and SSNs), and batch persist records to the DB.
6. **Relational Database (PostgreSQL)**: Optimized schemas storing chat chains, individual messages, and comprehensive telemetry profiles.

---

## ⚡ One-Command Setup (Docker Compose)

The entire pipeline—PostgreSQL, Redis, the Ingestion server, and the static Nginx host—can be brought online with a single command.

### Prerequisites
- [Docker](https://www.docker.com/) and Docker Compose installed.

### Spin up the services
1. Clone this repository and navigate to the directory:
   ```bash
   cd Ollive_Assignment
   ```
2. (Optional) Provide your foundation API keys in the root environment parameters:
   *If keys are omitted, the SDK will automatically trigger its highly sophisticated **Tracer simulation mockup** to demonstrate end-to-end streaming, latencies, PII redactions, and graphs instantly out of the box!*
   ```bash
   export OPENAI_API_KEY="your-key-here"
   export GEMINI_API_KEY="your-key-here"
   ```
3. Boot the network containers:
   ```bash
   docker-compose up --build
   ```
4. Access the web interface at **[http://localhost:3000](http://localhost:3000)**.
5. Access the backend server metrics at **[http://localhost:5001/api/analytics](http://localhost:5001/api/analytics)**.

---

## 🛠️ Standalone Local Development

If you prefer to run services manually outside Docker:

### 1. Database & Redis Requirements
Ensure Postgres is running at `localhost:5432` and Redis at `localhost:6379` (If unavailable, the system will seamlessly fall back to an active **In-Memory database and local asynchronous queue pipeline** with warning notices so that you can run the server immediately without infrastructure locks).

### 2. Set up Backend
```bash
cd backend
npm install
# Startup developer hot-reloading server on Port 5001
npm run dev
```

### 3. Set up Frontend
```bash
cd frontend
npm install
# Startup Vite development webserver on Port 3000
npm run dev
```

---

## 💾 Relational Database Schema Design

Optimized tables are declared inside `backend/src/db/schema.sql`:

### `conversations` Table
Tracks active user dialogue traces:
- `id` (UUID, Primary Key)
- `title` (VARCHAR)
- `provider` (VARCHAR)
- `model` (VARCHAR)
- `is_deleted` (BOOLEAN - used for soft deletion / cancellations)
- `created_at` / `updated_at` (TIMESTAMP WITH TIME ZONE)

### `messages` Table
Maintains multi-turn context (with Cascade triggers):
- `id` (UUID, Primary Key)
- `conversation_id` (UUID, Foreign Key)
- `role` (VARCHAR - user, assistant, system)
- `content` (TEXT)
- `created_at` (TIMESTAMP WITH TIME ZONE)

### `inference_logs` Table
Primary telemetry sink, indexed on query metrics to scale metrics aggregation:
- `id` (UUID, Primary Key)
- `conversation_id` (UUID, Nullable Foreign Key)
- `message_id` (UUID, Nullable Foreign Key)
- `provider` (VARCHAR)
- `model` (VARCHAR)
- `latency_ms` (INTEGER - overall model trip duration)
- `prompt_tokens` / `completion_tokens` / `total_tokens` (INTEGER)
- `tokens_per_second` (NUMERIC)
- `cost` (NUMERIC - USD billing cost)
- `status` (VARCHAR - success, error)
- `error_message` (TEXT, Nullable)
- `prompt_preview` / `response_preview` (TEXT)
- `pii_redacted` (BOOLEAN)
- `ip_address` (VARCHAR)
- `created_at` (TIMESTAMP WITH TIME ZONE)

---

## 📈 Scalability & System Considerations

### 1. Decoupled Ingestion Path
Instead of blocking live client connections to write telemetries, the **Inference SDK** handles logging as a fire-and-forget background task. The Express Ingest controller simply parses the body using Zod and immediately dumps the event to BullMQ/Redis (`202 Accepted`). This ensures the live user response speed is never degraded.

### 2. Streaming Latency Calculation
Calculating telemetry on streaming chunks is tricky. The custom SDK begins a timer when the prompt begins and tracks the exact millisecond a stream finishes or is aborted, calculating total elapsed time. If native usage metadata is unavailable, it estimates prompt and completion token boundaries (4 chars per token) and computes exact throughput:
$$\text{Throughput} = \frac{\text{Completion Tokens}}{\text{Latency in Seconds}}$$

### 3. PII Redaction Strategy
PII Scrubbing occurs inside the asynchronous worker queue. Prompts and outputs are filtered using a regex scanner (`backend/src/sdk/redactor.ts`), substituting Credit Cards, Email Addresses, Social Security Numbers (SSN), and Phone Numbers with generic tags.

---

## 🔮 Future Improvements with More Time

1. **Vector Embeddings Tracking**: Store prompt/response embeddings to monitor semantic drift in queries and cluster user intent over time.
2. **TimescaleDB Integration**: Switch the Postgres telemetry storage layer to timescaledb partition tables to handle billions of logs per day with sub-millisecond aggregation times.
3. **Advanced PII Filtering**: Replace regex-based redaction with a specialized local Named Entity Recognition (NER) model (e.g. Presidio) for greater precision across complex contexts.
4. **User Authentication & API Key Management**: Add JWT authorization layer to lock dashboards and chats behind team-scoped credentials.

---

## 🐳 Self-Hosted Kubernetes Deployment (Bonus)

Deploy configurations are stored inside `k8s/ollive-telemetry.yaml`.
To deploy the whole stack into your local self-hosted cluster (Minikube / k3s):
```bash
# Create namespace and apply secrets
kubectl create namespace ollive-telemetry
kubectl create secret generic llm-api-keys --from-literal=openai-key="your-key" --from-literal=gemini-key="your-key" -n ollive-telemetry

# Apply unified deployment configurations
kubectl apply -f k8s/ollive-telemetry.yaml
```
The gateway is configured to expose the app on `http://ollive-telemetry.local` using an Nginx ingress controller.
