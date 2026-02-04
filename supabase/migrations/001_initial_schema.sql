-- Engine Platform Database Schema
-- Version: 1.0.0

-- ============================================
-- Extensions
-- ============================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- API Authentication
-- ============================================

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_email TEXT,
  scopes TEXT[] DEFAULT ARRAY['jobs:write', 'jobs:read'],
  rate_limit_rpm INT DEFAULT 60,
  is_active BOOLEAN DEFAULT true,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  total_requests BIGINT DEFAULT 0,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE is_active = true;

-- ============================================
-- Agent Registry
-- ============================================

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  package_name TEXT NOT NULL UNIQUE,
  version TEXT DEFAULT '1.0.0',
  embedding vector(1536),
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agents_embedding ON agents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX idx_agents_verified ON agents(verified) WHERE verified = true;

-- ============================================
-- Job Queue
-- ============================================

CREATE TABLE job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Task definition
  task TEXT NOT NULL,
  priority INT DEFAULT 0,
  timeout_seconds INT DEFAULT 300,

  -- Status tracking
  status TEXT DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'waiting_for_user', 'cancelled')),

  -- Discovery results
  tools_discovered TEXT[],

  -- Execution context
  worker_id TEXT,
  execution_state JSONB,

  -- Results
  result TEXT,
  error_message TEXT,

  -- HITL
  agent_question TEXT,
  user_answer TEXT,

  -- Retry handling
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,

  -- Auth linkage
  api_key_id UUID REFERENCES api_keys(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ
);

CREATE INDEX idx_job_queue_status ON job_queue(status, priority DESC, created_at);
CREATE INDEX idx_job_queue_api_key ON job_queue(api_key_id);
CREATE INDEX idx_job_queue_worker ON job_queue(worker_id) WHERE status = 'running';

-- ============================================
-- Job Logs
-- ============================================

CREATE TABLE job_logs (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID REFERENCES job_queue(id) ON DELETE CASCADE,
  level TEXT DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  message TEXT NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_logs_job_id ON job_logs(job_id);
CREATE INDEX idx_job_logs_timestamp ON job_logs(job_id, timestamp DESC);

-- ============================================
-- Job Artifacts
-- ============================================

CREATE TABLE job_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES job_queue(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_artifacts_job_id ON job_artifacts(job_id);

-- ============================================
-- Workers
-- ============================================

CREATE TABLE workers (
  id TEXT PRIMARY KEY,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_jobs INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'draining', 'dead')),
  hostname TEXT,
  version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workers_heartbeat ON workers(last_heartbeat);
CREATE INDEX idx_workers_status ON workers(status) WHERE status = 'active';

-- ============================================
-- RPC Functions
-- ============================================

-- Atomic job claiming with FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION claim_next_job(p_worker_id TEXT)
RETURNS SETOF job_queue
LANGUAGE plpgsql AS $$
DECLARE
  v_job job_queue;
BEGIN
  SELECT * INTO v_job
  FROM job_queue
  WHERE status = 'queued'
  ORDER BY priority DESC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_job.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE job_queue
  SET
    status = 'running',
    worker_id = p_worker_id,
    started_at = NOW()
  WHERE id = v_job.id;

  v_job.status := 'running';
  v_job.worker_id := p_worker_id;
  v_job.started_at := NOW();
  RETURN NEXT v_job;
END;
$$;

-- Agent discovery via vector similarity
CREATE OR REPLACE FUNCTION match_agents(
  query_embedding vector,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (id uuid, name text, package_name text, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    agents.id,
    agents.name,
    agents.package_name,
    1 - (agents.embedding <=> query_embedding) as similarity
  FROM agents
  WHERE agents.verified = true
    AND 1 - (agents.embedding <=> query_embedding) > match_threshold
  ORDER BY agents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Stale job recovery from dead workers
CREATE OR REPLACE FUNCTION recover_stale_jobs(p_stale_threshold TIMESTAMPTZ)
RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  WITH stale_workers AS (
    SELECT id FROM workers
    WHERE last_heartbeat < p_stale_threshold
  ),
  recovered AS (
    UPDATE job_queue
    SET
      status = 'queued',
      worker_id = NULL,
      retry_count = retry_count + 1
    WHERE worker_id IN (SELECT id FROM stale_workers)
      AND status = 'running'
      AND retry_count < max_retries
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM recovered;

  UPDATE workers SET status = 'dead'
  WHERE last_heartbeat < p_stale_threshold;

  RETURN v_count;
END;
$$;

-- Increment API key usage (atomic)
CREATE OR REPLACE FUNCTION increment_api_key_usage(p_key_id UUID)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE api_keys
  SET
    last_used_at = NOW(),
    total_requests = total_requests + 1
  WHERE id = p_key_id;
END;
$$;

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (for worker and admin operations)
-- These policies allow authenticated service role full access

CREATE POLICY "Service role full access to jobs" ON job_queue
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to logs" ON job_logs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to artifacts" ON job_artifacts
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to api_keys" ON api_keys
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to agents" ON agents
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to workers" ON workers
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- Realtime
-- ============================================

-- Enable realtime for job_logs (for streaming logs to clients)
ALTER PUBLICATION supabase_realtime ADD TABLE job_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE job_queue;
