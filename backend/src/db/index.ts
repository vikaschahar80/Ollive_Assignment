import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Setup environment variables and database config
const isProduction = process.env.NODE_ENV === 'production';
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ollive_logging';

let pool: Pool | null = null;
let useMemoryFallback = false;

// In-Memory Database Fallback for development without Postgres
const memoryStore = {
  conversations: [] as any[],
  messages: [] as any[],
  inferenceLogs: [] as any[]
};

export async function initDb() {
  console.log(`[Database] Attempting connection via: ${connectionString.split('@')[1] || 'default string'}`);
  
  try {
    const needsSsl = isProduction || connectionString.includes('sslmode=require') || connectionString.includes('neon.tech');
    pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 5000, // 5 seconds timeout to fail fast and trigger fallback
      ssl: needsSsl ? { rejectUnauthorized: false } : false
    });

    // Test the connection
    const client = await pool.connect();
    console.log('[Database] Connected to PostgreSQL database successfully.');
    
    // Read and run schema.sql
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schemaSql);
        console.log('[Database] Database tables initialized/verified via schema.sql.');
      } else {
        // Handle TS relative build structures if we are running in dist
        const fallbackSchemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
        if (fs.existsSync(fallbackSchemaPath)) {
          const schemaSql = fs.readFileSync(fallbackSchemaPath, 'utf8');
          await client.query(schemaSql);
          console.log('[Database] Database tables initialized/verified via fallback schema.sql.');
        } else {
          console.warn('[Database] Warning: schema.sql not found, skipping schema execution.');
        }
      }
    } catch (schemaErr: any) {
      console.error('[Database] Failed to execute schema.sql:', schemaErr.message);
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.warn('\n⚠️ [Database] Connection failed. Fallback to IN-MEMORY database active. ⚠️');
    console.warn(`[Database] Error: ${err.message}\n`);
    useMemoryFallback = true;
    pool = null;
  }
}

export async function query(text: string, params?: any[]) {
  if (useMemoryFallback || !pool) {
    return queryInMemory(text, params);
  }

  try {
    return await pool.query(text, params);
  } catch (err: any) {
    console.error('[Database Error]', err.message);
    throw err;
  }
}

// In-Memory Database query parser (basic simulator for analytics and chat operations)
function queryInMemory(text: string, params: any[] = []): any {
  const queryStr = text.toLowerCase().replace(/\s+/g, ' ');

  // 1. Insert Conversation
  if (queryStr.includes('insert into conversations')) {
    const id = crypto.randomUUID();
    const title = params[0];
    const provider = params[1] || 'openai';
    const model = params[2] || 'gpt-4o-mini';
    const convo = {
      id,
      title,
      provider,
      model,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date()
    };
    memoryStore.conversations.push(convo);
    return { rows: [convo] };
  }

  // 2. Select Conversations
  if (queryStr.includes('select') && queryStr.includes('conversations')) {
    if (queryStr.includes('where id =')) {
      const id = params[0];
      const convo = memoryStore.conversations.find(c => c.id === id && !c.is_deleted);
      return { rows: convo ? [convo] : [] };
    }
    const convos = memoryStore.conversations
      .filter(c => !c.is_deleted)
      .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
    return { rows: convos };
  }

  // 3. Delete Conversation (Soft delete)
  if (queryStr.includes('update conversations set is_deleted = true')) {
    const id = params[0];
    const convo = memoryStore.conversations.find(c => c.id === id);
    if (convo) convo.is_deleted = true;
    return { rowCount: convo ? 1 : 0 };
  }

  // 4. Insert Message
  if (queryStr.includes('insert into messages')) {
    const id = crypto.randomUUID();
    const conversation_id = params[0];
    const role = params[1];
    const content = params[2];
    const msg = {
      id,
      conversation_id,
      role,
      content,
      created_at: new Date()
    };
    memoryStore.messages.push(msg);

    // Update conversation updated_at
    const convo = memoryStore.conversations.find(c => c.id === conversation_id);
    if (convo) convo.updated_at = new Date();

    return { rows: [msg] };
  }

  // 5. Select Messages
  if (queryStr.includes('select') && queryStr.includes('messages')) {
    const conversation_id = params[0];
    const msgs = memoryStore.messages
      .filter(m => m.conversation_id === conversation_id)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    return { rows: msgs };
  }

  // 6. Insert Inference Log
  if (queryStr.includes('insert into inference_logs')) {
    const id = crypto.randomUUID();
    const [convoId, msgId, provider, model, latency, promptTok, compTok, totalTok, tokPerSec, cost, status, errMsg, promptPre, respPre, piiRedacted, ip] = params;
    const log = {
      id,
      conversation_id: convoId,
      message_id: msgId,
      provider,
      model,
      latency_ms: parseInt(latency) || 0,
      prompt_tokens: parseInt(promptTok) || 0,
      completion_tokens: parseInt(compTok) || 0,
      total_tokens: parseInt(totalTok) || 0,
      tokens_per_second: parseFloat(tokPerSec) || 0,
      cost: parseFloat(cost) || 0,
      status,
      error_message: errMsg || null,
      prompt_preview: promptPre,
      response_preview: respPre,
      pii_redacted: !!piiRedacted,
      ip_address: ip || '127.0.0.1',
      created_at: new Date()
    };
    memoryStore.inferenceLogs.push(log);
    return { rows: [log] };
  }

  // 7. Select Analytics Logs
  if (queryStr.includes('select') && queryStr.includes('inference_logs')) {
    const logs = [...memoryStore.inferenceLogs].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    
    // Check if it's the raw log query (e.g. limit 50)
    if (queryStr.includes('limit')) {
      const match = queryStr.match(/limit\s+(\d+)/);
      const limit = match ? parseInt(match[1]) : 50;
      return { rows: logs.slice(0, limit) };
    }

    return { rows: logs };
  }

  // 8. Basic fallback rows
  return { rows: [] };
}

// Custom crypto UUID generator for older node versions fallback
const crypto = require('crypto');
