-- PostgreSQL Database Schema

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    provider VARCHAR(100) NOT NULL DEFAULT 'openai',
    model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Messages Table (multi-turn conversation details)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Inference Logs Table (SDK Telemetry Logging)
CREATE TABLE IF NOT EXISTS inference_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    provider VARCHAR(100) NOT NULL, -- 'openai', 'gemini', 'mock'
    model VARCHAR(100) NOT NULL, -- e.g. 'gpt-4o-mini', 'gemini-1.5-flash'
    latency_ms INTEGER NOT NULL, -- overall duration of prompt + completion
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    tokens_per_second NUMERIC(10, 2) DEFAULT 0.00,
    cost NUMERIC(12, 6) DEFAULT 0.000000,
    status VARCHAR(50) NOT NULL, -- 'success', 'error'
    error_message TEXT,
    prompt_preview TEXT,
    response_preview TEXT,
    pii_redacted BOOLEAN DEFAULT FALSE,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Optimize queries for Dashboards & Aggregations
CREATE INDEX IF NOT EXISTS idx_conversations_is_deleted_updated ON conversations(is_deleted, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON inference_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_provider_model ON inference_logs(provider, model);
CREATE INDEX IF NOT EXISTS idx_logs_status ON inference_logs(status);
