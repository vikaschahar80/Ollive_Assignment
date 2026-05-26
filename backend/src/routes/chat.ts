import { Router, Request, Response } from 'express';
import * as db from '../db';
import { executeInference } from '../sdk';
import { ChatMessage } from '../sdk/types';

const router = Router();

// 1. Start New Conversation
router.post('/conversations', async (req: Request, res: Response) => {
  const { title, provider, model } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Conversation title is required' });
  }

  try {
    const queryText = `
      INSERT INTO conversations (title, provider, model)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const result = await db.query(queryText, [
      title,
      provider || 'openai',
      model || 'gpt-4o-mini'
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. List All Active Conversations
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const queryText = `
      SELECT * FROM conversations
      WHERE is_deleted = false
      ORDER BY updated_at DESC;
    `;
    const result = await db.query(queryText);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Delete / Soft Cancel Conversation
router.delete('/conversations/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const queryText = `
      UPDATE conversations
      SET is_deleted = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    const result = await db.query(queryText, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Stream Chat Completion & Multi-turn History (with cancellation support)
router.post('/conversations/:id/chat', async (req: Request, res: Response) => {
  const conversationId = req.params.id;
  const { prompt, provider, model } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    // A. Verify conversation exists
    const convoResult = await db.query('SELECT * FROM conversations WHERE id = $1 AND is_deleted = false', [conversationId]);
    if (convoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found or deleted' });
    }

    const conversation = convoResult.rows[0];
    const finalProvider = provider || conversation.provider;
    const finalModel = model || conversation.model;

    // B. Fetch historical context (max 10 messages for short conversational context)
    const historyResult = await db.query(`
      SELECT role, content FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      LIMIT 10;
    `, [conversationId]);

    const historicalMessages: ChatMessage[] = historyResult.rows.map((row: any) => ({
      role: row.role as 'user' | 'assistant' | 'system',
      content: row.content
    }));

    // C. Insert new user message
    const userMsgInsert = await db.query(`
      INSERT INTO messages (conversation_id, role, content)
      VALUES ($1, 'user', $2)
      RETURNING *;
    `, [conversationId, prompt]);

    const userMessage = userMsgInsert.rows[0];

    // D. Build full prompt stream sequence
    const completeMessages: ChatMessage[] = [
      ...historicalMessages,
      { role: 'user', content: prompt }
    ];

    // E. Initialize Stream Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Prepare cancellation control
    const abortController = new AbortController();
    
    // Listen for client connection drop/disconnect to cancel LLM stream
    req.on('close', () => {
      console.log(`[Stream Connection] Client closed connection for Convo ${conversationId}. Aborting LLM request.`);
      abortController.abort();
    });

    // Create a new message ID for the assistant answer
    const assistantMsgInsert = await db.query(`
      INSERT INTO messages (conversation_id, role, content)
      VALUES ($1, 'assistant', '')
      RETURNING id;
    `, [conversationId]);
    const assistantMessageId = assistantMsgInsert.rows[0].id;

    // F. Execute call using SDK with streams
    let compiledResponse = '';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || '127.0.0.1';

    try {
      compiledResponse = await executeInference({
        conversationId,
        messageId: assistantMessageId,
        provider: finalProvider,
        model: finalModel,
        messages: completeMessages,
        ipAddress,
        abortSignal: abortController.signal,
        onStreamChunk: (chunkText) => {
          // Write chunk via standard Server-Sent Events structure
          res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
        }
      });

      // Update message text content on complete
      await db.query(`
        UPDATE messages
        SET content = $1
        WHERE id = $2;
      `, [compiledResponse, assistantMessageId]);

      // Update conversation timestamp
      await db.query(`
        UPDATE conversations
        SET updated_at = CURRENT_TIMESTAMP, provider = $1, model = $2
        WHERE id = $3;
      `, [finalProvider, finalModel, conversationId]);

      // Write final stream closure event
      res.write('data: [DONE]\n\n');
      res.end();

    } catch (err: any) {
      if (abortController.signal.aborted) {
        // If aborted mid-stream, write out the current response so far to DB and end
        console.log(`[Stream Connection] Stream was aborted. Committing partial answer: "${compiledResponse}"`);
        
        await db.query(`
          UPDATE messages
          SET content = $1
          WHERE id = $2;
        `, [compiledResponse + ' [CANCELLED BY USER]', assistantMessageId]);

        res.write(`data: ${JSON.stringify({ cancelled: true, final: compiledResponse })}\n\n`);
        res.end();
      } else {
        // Real model error during call
        const errorMsgText = `Error calling model provider: ${err.message}`;
        await db.query(`
          UPDATE messages
          SET content = $1
          WHERE id = $2;
        `, [errorMsgText, assistantMessageId]);

        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    }

  } catch (err: any) {
    console.error('[Chat Completion Error]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// 5. Fetch specific conversation messages history
router.get('/conversations/:id/messages', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const messages = await db.query(`
      SELECT * FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC;
    `, [id]);
    res.json(messages.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
