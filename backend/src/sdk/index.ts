import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { InferenceLogPayload, LLMRequestOptions, ChatMessage } from './types';
import { redactPII } from './redactor';

// Setup clients with environment variables (if provided)
const openAIKey = process.env.OPENAI_API_KEY || '';
const geminiKey = process.env.GEMINI_API_KEY || '';

const openai = openAIKey ? new OpenAI({ 
  apiKey: openAIKey,
  ...(openAIKey.startsWith('sk-or-') ? { baseURL: 'https://openrouter.ai/api/v1' } : {})
}) : null;
const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;

// Standard static pricing lookup (USD per token)
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.00000015, output: 0.00000060 },
  'gpt-4o': { input: 0.0000025, output: 0.000010 },
  'gpt-3.5-turbo': { input: 0.00000050, output: 0.00000150 },
  'meta-llama/llama-3-8b-instruct:free': { input: 0, output: 0 },
  'gemini-1.5-flash': { input: 0.000000075, output: 0.00000030 },
  'gemini-2.0-flash': { input: 0.000000075, output: 0.00000030 },
  'gemini-1.5-pro': { input: 0.00000125, output: 0.0000050 },
  'gemini-2.5-pro': { input: 0.00000125, output: 0.0000050 },
  'gemini-pro': { input: 0.00000050, output: 0.00000150 },
  'mock-model': { input: 0, output: 0 }
};

/**
 * Estimate tokens based on character length fallback (approx 4 characters = 1 token)
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Calculate token cost
 */
function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const modelKey = model.toLowerCase();
  let pricing = PRICING[modelKey];
  
  if (!pricing) {
    if (modelKey.includes('mini')) pricing = PRICING['gpt-4o-mini'];
    else if (modelKey.includes('flash')) pricing = PRICING['gemini-1.5-flash'];
    else if (modelKey.includes('pro')) pricing = PRICING['gemini-1.5-pro'];
    else pricing = PRICING['gpt-4o']; // Default to standard high performance pricing
  }

  return (inputTokens * pricing.input) + (outputTokens * pricing.output);
}

/**
 * Send telemetry metrics to the ingestion pipeline in a non-blocking background task.
 */
async function sendTelemetry(payload: InferenceLogPayload) {
  const ingestUrl = process.env.INGESTION_ENDPOINT || 'http://localhost:5001/api/ingest';
  
  // Non-blocking fire-and-forget call
  fetch(ingestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch((err) => {
    console.error('[Telemetry SDK] Failed to dispatch inference log:', err.message);
  });
}

/**
 * Executes a LLM Completion (Streaming or Non-Streaming) with detailed telemetry tracking.
 */
export async function executeInference(options: LLMRequestOptions): Promise<string> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();
  
  const userPrompt = options.messages.filter(m => m.role === 'user').map(m => m.content).join('\n') || '';
  let finalResponseText = '';
  let provider = options.provider;
  let model = options.model;
  let status: 'success' | 'error' = 'success';
  let errorMessage: string | null = null;
  
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    // Determine if we need to run in mock mode because API key is absent
    const isMock = 
      provider === 'mock' || 
      (provider === 'openai' && !openai) || 
      (provider === 'gemini' && !genAI);

    if (isMock) {
      // Simulate real latency and response
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulating 800ms API response latency
      
      const promptLower = userPrompt.toLowerCase();
      let mockReply = `Hello! I am a simulated response since the backend has no API keys configured for ${provider}. I can assist with conversation flow testing. Feel free to ask more.`;
      
      if (promptLower.includes('credit card') || promptLower.includes('phone') || promptLower.includes('ssn') || promptLower.includes('email')) {
        mockReply = `This is a test response containing simulated sensitive details.
Here is some mock data to verify redaction:
- Credit Card: 4111 2222 3333 4444
- Phone Number: 555-019-2834
- Email: work@ollive.ai
- SSN: 000-12-3456
Let's see if this gets redacted successfully in the analytics logs!`;
      } else if (promptLower.includes('help') || promptLower.includes('what can you do')) {
        mockReply = `I am a multi-provider simulated assistant. If you configure process.env.OPENAI_API_KEY or process.env.GEMINI_API_KEY, I will perform real calls. 
Features implemented:
1. Streaming completions (simulated chunks)
2. Live Latency/Throughput analytics
3. Automatic PII Scrubbing
4. Event queue integration (Redis + BullMQ)`;
      }

      if (options.onStreamChunk) {
        // Stream simulated chunks
        const chunks = mockReply.match(/.{1,8}/g) || [mockReply];
        for (const chunk of chunks) {
          if (options.abortSignal?.aborted) {
            throw new Error('Streaming connection aborted by user');
          }
          options.onStreamChunk(chunk);
          await new Promise(resolve => setTimeout(resolve, 35)); // Fast streaming simulation
        }
      }

      finalResponseText = mockReply;
      promptTokens = estimateTokens(userPrompt);
      completionTokens = estimateTokens(mockReply);
      
    } else if (provider === 'openai' && openai) {
      const formattedMessages = options.messages.map(m => ({ role: m.role, content: m.content }));
      
      if (options.onStreamChunk) {
        const stream = await openai.chat.completions.create({
          model: model,
          messages: formattedMessages,
          stream: true,
          stream_options: { include_usage: true }
        }, { signal: options.abortSignal });

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            options.onStreamChunk(content);
            finalResponseText += content;
          }
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens;
            completionTokens = chunk.usage.completion_tokens;
          }
        }

        if (promptTokens === 0) {
          promptTokens = estimateTokens(userPrompt);
          completionTokens = estimateTokens(finalResponseText);
        }
      } else {
        const response = await openai.chat.completions.create({
          model: model,
          messages: formattedMessages
        });

        finalResponseText = response.choices[0]?.message?.content || '';
        promptTokens = response.usage?.prompt_tokens || estimateTokens(userPrompt);
        completionTokens = response.usage?.completion_tokens || estimateTokens(finalResponseText);
      }

    } else if (provider === 'gemini' && genAI) {
      const geminiModel = genAI.getGenerativeModel({ model: model });
      
      // Structure messages for Gemini's structure
      // Format: { role: 'user' | 'model', parts: [{ text: '' }] }
      const history = options.messages.slice(0, -1).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));
      const latestMessage = options.messages[options.messages.length - 1].content;

      const chat = geminiModel.startChat({
        history: history,
      });

      if (options.onStreamChunk) {
        const result = await chat.sendMessageStream(latestMessage);
        
        for await (const chunk of result.stream) {
          if (options.abortSignal?.aborted) {
            throw new Error('Streaming connection aborted by user');
          }
          const chunkText = chunk.text();
          options.onStreamChunk(chunkText);
          finalResponseText += chunkText;
        }

        // Fetch tokens info at the end of the streaming run
        try {
          const countResponse = await geminiModel.countTokens({
            contents: [...history, { role: 'user', parts: [{ text: latestMessage }] }]
          });
          promptTokens = countResponse.totalTokens;
          completionTokens = estimateTokens(finalResponseText);
        } catch {
          promptTokens = estimateTokens(userPrompt);
          completionTokens = estimateTokens(finalResponseText);
        }

      } else {
        const result = await chat.sendMessage(latestMessage);
        finalResponseText = result.response.text();
        
        try {
          const countResponse = await geminiModel.countTokens({
            contents: [...history, { role: 'user', parts: [{ text: latestMessage }] }]
          });
          promptTokens = countResponse.totalTokens;
          completionTokens = estimateTokens(finalResponseText);
        } catch {
          promptTokens = estimateTokens(userPrompt);
          completionTokens = estimateTokens(finalResponseText);
        }
      }
    }
  } catch (err: any) {
    status = 'error';
    errorMessage = err.message || 'Unknown inference error';
    
    // Fallbacks
    promptTokens = promptTokens || estimateTokens(userPrompt);
    completionTokens = completionTokens || estimateTokens(finalResponseText);
    
    console.error(`[Telemetry SDK] Inference failed during ${provider}/${model}:`, err);
    throw err;
  } finally {
    const endTime = performance.now();
    const latency_ms = Math.round(endTime - startTime);
    const total_tokens = promptTokens + completionTokens;
    const latencySec = latency_ms / 1000;
    const tokens_per_second = latencySec > 0 ? parseFloat((completionTokens / latencySec).toFixed(2)) : 0;
    const cost = parseFloat(calculateCost(model, promptTokens, completionTokens).toFixed(6));
    
    // Check for pre-redaction in sdk to capture redaction flag
    const redactCheck = redactPII(userPrompt + ' ' + finalResponseText);

    const logPayload: InferenceLogPayload = {
      conversation_id: options.conversationId,
      message_id: options.messageId,
      provider: provider as 'openai' | 'gemini' | 'mock',
      model: model,
      latency_ms,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens,
      tokens_per_second,
      cost,
      status,
      error_message: errorMessage,
      prompt_preview: userPrompt,
      response_preview: finalResponseText,
      pii_redacted: redactCheck.hasChanges,
      ip_address: options.ipAddress || '127.0.0.1',
      created_at: timestamp
    };

    // Push log asynchronously to ingestion API
    sendTelemetry(logPayload);
  }

  return finalResponseText;
}
