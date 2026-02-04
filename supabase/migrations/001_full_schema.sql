-- Engine Platform Database Schema
-- Version: 2.0.0 (Combined)

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
-- Agent Registry (Tool Marketplace)
-- ============================================

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  package_name TEXT NOT NULL UNIQUE,
  version TEXT DEFAULT '1.0.0',
  embedding vector(1536),
  -- Tool marketplace fields
  usage_example TEXT,
  import_statement TEXT,
  category TEXT DEFAULT 'general',
  documentation TEXT,
  author TEXT,
  repository_url TEXT,
  is_builtin BOOLEAN DEFAULT false,
  -- Verification
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agents_embedding ON agents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX idx_agents_verified ON agents(verified) WHERE verified = true;
CREATE INDEX idx_agents_category ON agents(category) WHERE verified = true;

-- ============================================
-- Job Queue
-- ============================================

CREATE TABLE job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Task definition
  task TEXT NOT NULL,
  priority INT DEFAULT 0,
  timeout_seconds INT DEFAULT 300,
  model TEXT DEFAULT 'anthropic/claude-sonnet-4',

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
-- Job Artifacts (Output files)
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
-- Job Attachments (Input files)
-- ============================================

CREATE TABLE job_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES job_queue(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_attachments_job_id ON job_attachments(job_id);

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
ALTER TABLE job_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to jobs" ON job_queue
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to logs" ON job_logs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to artifacts" ON job_artifacts
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to attachments" ON job_attachments
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

ALTER PUBLICATION supabase_realtime ADD TABLE job_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE job_queue;

-- ============================================
-- Seed Data: Built-in Tools
-- ============================================

INSERT INTO agents (name, description, package_name, version, category, import_statement, usage_example, documentation, is_builtin, verified, verified_at)
VALUES
  (
    'Web Scraper',
    'Scrape and extract content from websites. Useful for fetching data from URLs, parsing HTML, and extracting text or structured data from web pages.',
    'requests,beautifulsoup4',
    '1.0.0',
    'web',
    'import requests
from bs4 import BeautifulSoup',
    'response = requests.get("https://example.com")
soup = BeautifulSoup(response.text, "html.parser")
title = soup.find("title").text
print(title)',
    'Use requests to fetch URLs and BeautifulSoup to parse HTML. Always handle errors gracefully.',
    true, true, NOW()
  ),
  (
    'Data Analyzer',
    'Analyze data using pandas. Create dataframes, perform statistical analysis, filter and transform data, and generate insights from CSV or JSON data.',
    'pandas,numpy',
    '1.0.0',
    'data',
    'import pandas as pd
import numpy as np',
    'df = pd.DataFrame({"name": ["Alice", "Bob"], "age": [25, 30]})
print(df.describe())',
    'Use pandas for data manipulation. Supports CSV, JSON, and in-memory data structures.',
    true, true, NOW()
  ),
  (
    'Chart Generator',
    'Create charts and visualizations. Generate bar charts, line graphs, pie charts, scatter plots, and save them as image files.',
    'matplotlib,seaborn',
    '1.0.0',
    'visualization',
    'import matplotlib.pyplot as plt
import seaborn as sns',
    'plt.bar(["A", "B", "C"], [10, 20, 15])
plt.savefig("chart.png")
print("Chart saved to chart.png")',
    'Use matplotlib for basic charts. Always save figures to files.',
    true, true, NOW()
  ),
  (
    'Image Processor',
    'Process and manipulate images. Resize, crop, convert formats, add text overlays, and save processed images.',
    'pillow',
    '1.0.0',
    'media',
    'from PIL import Image, ImageDraw',
    'img = Image.new("RGB", (200, 100), color="blue")
img.save("output.png")
print("Image saved")',
    'Use Pillow (PIL) for image manipulation.',
    true, true, NOW()
  ),
  (
    'Math & Statistics',
    'Perform mathematical calculations and statistical analysis. Calculate mean, median, standard deviation, solve equations.',
    'numpy,scipy',
    '1.0.0',
    'math',
    'import numpy as np
from scipy import stats',
    'data = np.array([1, 2, 3, 4, 5])
print(f"Mean: {np.mean(data)}")',
    'Use numpy for numerical operations.',
    true, true, NOW()
  ),
  (
    'File Handler',
    'Read and write files. Handle CSV, JSON, TXT formats. Parse structured data and save outputs.',
    'csv,json',
    '1.0.0',
    'file',
    'import csv
import json',
    'with open("data.json", "w") as f:
    json.dump({"key": "value"}, f)',
    'Use built-in modules for file operations.',
    true, true, NOW()
  ),
  (
    'API Client',
    'Make HTTP requests to APIs. Fetch data from REST APIs, handle authentication, parse JSON responses.',
    'requests',
    '1.0.0',
    'web',
    'import requests',
    'response = requests.get("https://api.example.com/data")
print(response.json())',
    'Use requests for HTTP calls.',
    true, true, NOW()
  ),
  (
    'Text Processor',
    'Process and analyze text. Regex matching, string manipulation, text cleaning, word counting.',
    're,collections',
    '1.0.0',
    'text',
    'import re
from collections import Counter',
    'words = "hello world hello".split()
print(Counter(words))',
    'Use re for patterns and collections for counting.',
    true, true, NOW()
  )
ON CONFLICT (package_name) DO NOTHING;
