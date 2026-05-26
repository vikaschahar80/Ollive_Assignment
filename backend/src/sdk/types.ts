export interface InferenceLogPayload {
  conversation_id: string;
  message_id?: string;
  provider: 'openai' | 'gemini' | 'mock';
  model: string;
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  tokens_per_second: number;
  cost: number;
  status: 'success' | 'error';
  error_message?: string | null;
  prompt_preview: string;
  response_preview: string;
  pii_redacted: boolean;
  ip_address?: string;
  created_at?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMRequestOptions {
  conversationId: string;
  messageId: string;
  provider: 'openai' | 'gemini' | 'mock';
  model: string;
  messages: ChatMessage[];
  ipAddress?: string;
  onStreamChunk?: (text: string) => void;
  abortSignal?: AbortSignal;
}
