import * as dotenv from 'dotenv';
dotenv.config(); // MUST run first to populate process.env

import express from 'express';
import cors from 'cors';
import * as db from './db';
import { initRedis } from './queue/connection';
import { initLogQueue } from './queue/logQueue';
import { initLogWorker } from './queue/logWorker';

import chatRouter from './routes/chat';
import ingestRouter from './routes/ingest';
import analyticsRouter from './routes/analytics';

const app = express();
const PORT = process.env.PORT || 5001;

// 1. Configure Middlewares
app.use(cors({
  origin: '*', // Allow all client links to query telemetry
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Request logger for inspection
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 2. Register Routes
app.use('/api', chatRouter);
app.use('/api', ingestRouter);
app.use('/api/analytics', analyticsRouter);

// Basic health check route
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// 3. System Initialization
async function startServer() {
  console.log('🚀 Starting Ollive Inference Logging System...');
  
  // A. Initialize PostgreSQL Database
  await db.initDb();

  // B. Initialize Redis & Queue Systems
  await initRedis();
  initLogQueue();
  initLogWorker();


  // C. Start Listening
  app.listen(PORT, () => {
    console.log(`📡 Ingestion and API Server active on http://localhost:${PORT}`);
  });
}

// Global Exception Catching to prevent system drops
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

startServer();
