import React, { useState, useEffect, useRef } from 'react';
import { Send, Ban, MessageSquare, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { API_BASE } from '../config';

function ChatWindow({
  activeConvoId,
  messages,
  setMessages,
  isStreaming,
  setIsStreaming,
  provider,
  setProvider,
  model,
  setModel,
  showToast,
  onStartNewChat,
  refreshConversations
}) {
  const [inputText, setInputText] = useState('');
  const [showPiiPreview, setShowPiiPreview] = useState(false);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Auto-scroll messages to the bottom when history updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Adjust models automatically when provider switches
  const handleProviderChange = (e) => {
    const nextProvider = e.target.value;
    setProvider(nextProvider);
    if (nextProvider === 'openai') {
      setModel('gpt-3.5-turbo');
    } else if (nextProvider === 'gemini') {
      setModel('gemini-1.5-flash');
    } else {
      setModel('mock-model');
    }
  };

  // Submit Prompt to Streaming Endpoint
  const handleSubmitPrompt = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !activeConvoId || isStreaming) return;

    const promptText = inputText;
    setInputText('');

    // Append user prompt locally instantly
    const userMsgTempId = crypto.randomUUID();
    const assistantMsgTempId = crypto.randomUUID();

    setMessages(prev => [
      ...prev,
      { id: userMsgTempId, role: 'user', content: promptText, created_at: new Date() },
      { id: assistantMsgTempId, role: 'assistant', content: '', created_at: new Date() }
    ]);

    setIsStreaming(true);

    // Set up AbortController for Cancellation support
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/conversations/${activeConvoId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          provider: provider,
          model: model
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      // Stream Reader setup
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let assistantResponse = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          // Split SSE format "data: {...}\n\n"
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataText = line.slice(6).trim();
              if (dataText === '[DONE]') {
                done = true;
                break;
              }

              let parsed = null;
              try {
                parsed = JSON.parse(dataText);
              } catch (parseErr) {
                // Ignore malformed/empty SSE lines gracefully
              }

              if (parsed) {
                if (parsed.text) {
                  assistantResponse += parsed.text;
                  // Update current message stream UI
                  setMessages(prev => prev.map(m => 
                    m.id === assistantMsgTempId ? { ...m, content: assistantResponse } : m
                  ));
                } else if (parsed.cancelled) {
                  assistantResponse = parsed.final + ' [CANCELLED BY USER]';
                  setMessages(prev => prev.map(m => 
                    m.id === assistantMsgTempId ? { ...m, content: assistantResponse } : m
                  ));
                  showToast('Completion cancelled by user.', 'warning');
                  done = true;
                } else if (parsed.error) {
                  throw new Error(parsed.error);
                }
              }
            }
          }
        }
      }

      setIsStreaming(false);
      abortControllerRef.current = null;
      refreshConversations(); // Update list times

    } catch (err) {
      if (err.name === 'AbortError') {
        showToast('Stream generation aborted.', 'warning');
      } else {
        showToast(err.message || 'Stream processing failure', 'error');
        // Render error state on the assistant bubble
        setMessages(prev => prev.map(m => 
          m.id === assistantMsgTempId ? { ...m, content: `System Error: ${err.message}` } : m
        ));
      }
      setIsStreaming(false);
      abortControllerRef.current = null;
      refreshConversations();
    }
  };

  // Terminate Live Stream Connection (Abort Controller Trigger)
  const handleCancelStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      showToast('Terminating stream connection...', 'warning');
    }
  };

  // Helper utility to highlight what PII would look like redacted
  const simulatePiiRedaction = (text) => {
    if (!text) return text;
    // Highlight credit cards, phone numbers, emails, SSNs in gold
    let parsed = text;
    parsed = parsed.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '<span style="color:var(--accent-secondary);background:rgba(6,182,212,0.15);padding:0 4px;border-radius:4px;font-family:var(--font-mono)">[REDACTED_EMAIL]</span>');
    parsed = parsed.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '<span style="color:var(--accent-secondary);background:rgba(6,182,212,0.15);padding:0 4px;border-radius:4px;font-family:var(--font-mono)">[REDACTED_SSN]</span>');
    parsed = parsed.replace(/\b(?:\d[ -]*?){13,19}\b/g, '<span style="color:var(--accent-secondary);background:rgba(6,182,212,0.15);padding:0 4px;border-radius:4px;font-family:var(--font-mono)">[REDACTED_CARD]</span>');
    return parsed;
  };

  return (
    <div className="chat-workspace">
      {/* Header controls bar */}
      <div className="controls-bar">
        <select 
          className="control-select" 
          value={provider} 
          onChange={handleProviderChange}
          disabled={isStreaming}
        >
          <option value="mock">Provider: Simulated SDK Fallback</option>
          <option value="openai">Provider: OpenAI (Real API)</option>
          <option value="gemini">Provider: Gemini (Real API)</option>
        </select>

        <select 
          className="control-select" 
          value={model} 
          onChange={(e) => setModel(e.target.value)}
          disabled={isStreaming}
        >
          {provider === 'mock' && <option value="mock-model">Model: Simulated Tracer LLM</option>}
          {provider === 'openai' && (
            <>
              <option value="gpt-3.5-turbo">Model: GPT-3.5-turbo (Free Tier)</option>
              <option value="gpt-4o-mini">Model: GPT-4o-mini (Lightweight)</option>
              <option value="gpt-4o">Model: GPT-4o (High-perf)</option>
              <option value="meta-llama/llama-3-8b-instruct:free">Model: LLaMA-3-8b (OpenRouter Free)</option>
            </>
          )}
          {provider === 'gemini' && (
            <>
              <option value="gemini-1.5-flash">Model: Gemini-1.5-flash (Free - 15 RPM)</option>
              <option value="gemini-2.0-flash">Model: Gemini-2.0-flash (Free - 10 RPM)</option>
              <option value="gemini-2.5-pro">Model: Gemini-2.5-pro (Free - 2 RPM)</option>
              <option value="gemini-pro">Model: Gemini-pro (Legacy)</option>
            </>
          )}
        </select>
      </div>

      {/* Messages block */}
      {!activeConvoId ? (
        <div className="chat-empty-state">
          <div className="empty-icon">🤖</div>
          <h2 className="empty-title">Inference Telemetry Chat</h2>
          <p className="empty-desc">
            Welcome to the Ollive Ingestion portal! Set your LLM provider options at the top, start a new chat session, and watch latency and throughput sync to our dashboard in near real-time.
          </p>
          <button className="new-chat-btn" onClick={onStartNewChat} style={{ margin: 0 }}>
            Start Chat Session
          </button>
        </div>
      ) : (
        <div className="chat-message-feed">
          {messages.length === 0 ? (
            <div className="chat-empty-state" style={{ opacity: 0.6 }}>
              <MessageSquare size={36} style={{ color: 'var(--text-muted)' }} />
              <p style={{ fontSize: '0.9rem' }}>Send a message to begin tracing this inference flow...</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={msg.id || idx} className={`message-bubble-wrapper ${msg.role}`}>
                <div className="message-bubble">
                  {msg.role === 'user' && showPiiPreview ? (
                    <div dangerouslySetInnerHTML={{ __html: simulatePiiRedaction(msg.content) }} />
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  )}

                  <div className="message-meta">
                    <span style={{ textTransform: 'uppercase', fontWeight: 600, fontSize: '0.65rem' }}>
                      {msg.role === 'user' ? 'Client Request' : 'Telemetry Answer'}
                    </span>
                    {msg.role === 'assistant' && (
                      <span className="badge-model">
                        {provider}/{model.replace('-model', '')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}

          {isStreaming && (
            <div className="message-bubble-wrapper assistant">
              <div className="message-bubble" style={{ minWidth: '80px' }}>
                <div className="typing-loader">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input Action Form */}
      {activeConvoId && (
        <form onSubmit={handleSubmitPrompt} className="chat-input-area">
          <textarea
            className="chat-input-box"
            placeholder={isStreaming ? "Generating answer stream..." : "Type prompt (e.g. Include phone 555-019-2834 or card 4111 2222 to test PII Redaction)..."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isStreaming}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmitPrompt(e);
              }
            }}
          />

          <div className="input-actions-bar">
            {/* PII Redactor inspection status badge */}
            <div className="input-disclaimers">
              <button
                type="button"
                className="pii-toggle-badge"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: showPiiPreview ? 'rgba(6, 182, 212, 0.15)' : '',
                  borderColor: showPiiPreview ? 'var(--accent-secondary)' : '',
                  color: showPiiPreview ? 'var(--accent-secondary)' : '',
                  cursor: 'pointer'
                }}
                onClick={() => setShowPiiPreview(!showPiiPreview)}
                title="Toggle highlighting of what sensitive values will be redacted in logs"
              >
                <ShieldCheck size={12} />
                <span>PII Log Watcher: {showPiiPreview ? 'On' : 'Off'}</span>
              </button>
            </div>

            {isStreaming ? (
              <button 
                type="button" 
                className="cancel-stream-btn"
                onClick={handleCancelStream}
              >
                <Ban size={14} />
                <span>Cancel Generation</span>
              </button>
            ) : (
              <button 
                type="submit" 
                className="submit-btn"
                disabled={!inputText.trim()}
              >
                <Send size={14} />
                <span>Send Trace</span>
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

export default ChatWindow;
