-- Engine Platform Database Schema
-- Version: 2.0.0 (MCP-only)

-- ============================================
-- Extensions
-- ============================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- Drop Existing Objects (for re-wipes)
-- ============================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE job_logs;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE job_queue;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP FUNCTION IF EXISTS claim_next_job(TEXT);
DROP FUNCTION IF EXISTS match_agents(vector, float, int);
DROP FUNCTION IF EXISTS recover_stale_jobs(TIMESTAMPTZ);
DROP FUNCTION IF EXISTS increment_api_key_usage(UUID);

DROP TABLE IF EXISTS job_attachments CASCADE;
DROP TABLE IF EXISTS job_artifacts CASCADE;
DROP TABLE IF EXISTS job_logs CASCADE;
DROP TABLE IF EXISTS job_queue CASCADE;
DROP TABLE IF EXISTS workers CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;

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
-- MCP Server Registry
-- ============================================

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  mcp_package TEXT NOT NULL UNIQUE,
  version TEXT DEFAULT '1.0.0',
  embedding vector(1536),
  -- MCP configuration
  mcp_transport TEXT DEFAULT 'stdio' CHECK (mcp_transport IN ('stdio', 'sse', 'http')),
  mcp_args TEXT[] DEFAULT '{}',
  mcp_env JSONB DEFAULT '{}',
  mcp_tools JSONB DEFAULT '[]',
  -- Metadata
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
  task TEXT NOT NULL,
  priority INT DEFAULT 0,
  timeout_seconds INT DEFAULT 300,
  model TEXT DEFAULT 'anthropic/claude-sonnet-4',
  status TEXT DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'waiting_for_user', 'cancelled')),
  tools_discovered TEXT[],
  worker_id TEXT,
  execution_state JSONB,
  result TEXT,
  error_message TEXT,
  agent_question TEXT,
  user_answer TEXT,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  api_key_id UUID REFERENCES api_keys(id),
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

CREATE OR REPLACE FUNCTION match_agents(
  query_embedding vector,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (id uuid, name text, mcp_package text, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    agents.id,
    agents.name,
    agents.mcp_package,
    1 - (agents.embedding <=> query_embedding) as similarity
  FROM agents
  WHERE agents.verified = true
    AND 1 - (agents.embedding <=> query_embedding) > match_threshold
  ORDER BY agents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

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
-- Seed Data: MCP Servers
-- ============================================

INSERT INTO agents (
  name, description, mcp_package, version, category,
  mcp_transport, mcp_args, mcp_tools,
  documentation, repository_url, author,
  is_builtin, verified, verified_at
)
VALUES
  (
    'Filesystem',
    'Secure file operations with configurable access controls. Read, write, search, and manage files and directories.',
    '@modelcontextprotocol/server-filesystem',
    '1.0.0',
    'file',
    'stdio',
    ARRAY['/home/user'],
    '[
      {"name": "read_file", "description": "Read complete contents of a file"},
      {"name": "read_multiple_files", "description": "Read multiple files simultaneously"},
      {"name": "write_file", "description": "Create or overwrite a file"},
      {"name": "edit_file", "description": "Make selective edits using pattern matching"},
      {"name": "create_directory", "description": "Create a new directory"},
      {"name": "list_directory", "description": "List directory contents"},
      {"name": "directory_tree", "description": "Get recursive tree view"},
      {"name": "move_file", "description": "Move or rename files"},
      {"name": "search_files", "description": "Search for files matching pattern"},
      {"name": "get_file_info", "description": "Get file metadata"}
    ]'::jsonb,
    'Official MCP server for filesystem operations.',
    'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    'Anthropic',
    true, true, NOW()
  ),
  (
    'Fetch',
    'Web content fetching and conversion. Fetches URLs and converts HTML to markdown for LLM consumption.',
    '@modelcontextprotocol/server-fetch',
    '1.0.0',
    'web',
    'stdio',
    ARRAY[]::TEXT[],
    '[{"name": "fetch", "description": "Fetch URL and return content as markdown"}]'::jsonb,
    'Official MCP server for web fetching.',
    'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
    'Anthropic',
    true, true, NOW()
  ),
  (
    'GitHub',
    'Full GitHub API integration. Manage repos, issues, PRs, branches, and search code.',
    '@modelcontextprotocol/server-github',
    '1.0.0',
    'dev',
    'stdio',
    ARRAY[]::TEXT[],
    '[
      {"name": "create_or_update_file", "description": "Create or update a file in a repo"},
      {"name": "search_repositories", "description": "Search GitHub repositories"},
      {"name": "create_repository", "description": "Create a new repository"},
      {"name": "get_file_contents", "description": "Get file or directory contents"},
      {"name": "push_files", "description": "Push multiple files in one commit"},
      {"name": "create_issue", "description": "Create a new issue"},
      {"name": "create_pull_request", "description": "Create a pull request"},
      {"name": "fork_repository", "description": "Fork a repository"},
      {"name": "create_branch", "description": "Create a new branch"},
      {"name": "list_commits", "description": "List commits in a branch"},
      {"name": "list_issues", "description": "List issues with filters"},
      {"name": "search_code", "description": "Search code across repos"}
    ]'::jsonb,
    'Requires GITHUB_PERSONAL_ACCESS_TOKEN env var.',
    'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    'Anthropic',
    true, true, NOW()
  ),
  (
    'Puppeteer',
    'Browser automation. Navigate pages, screenshots, click, fill forms, execute JS.',
    '@modelcontextprotocol/server-puppeteer',
    '1.0.0',
    'web',
    'stdio',
    ARRAY[]::TEXT[],
    '[
      {"name": "puppeteer_navigate", "description": "Navigate to a URL"},
      {"name": "puppeteer_screenshot", "description": "Take a screenshot"},
      {"name": "puppeteer_click", "description": "Click an element"},
      {"name": "puppeteer_fill", "description": "Fill an input field"},
      {"name": "puppeteer_select", "description": "Select from dropdown"},
      {"name": "puppeteer_hover", "description": "Hover over element"},
      {"name": "puppeteer_evaluate", "description": "Execute JavaScript"}
    ]'::jsonb,
    'Official MCP server for browser automation.',
    'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
    'Anthropic',
    true, true, NOW()
  ),
  (
    'Sequential Thinking',
    'Structured problem-solving through thought sequences. Break down problems, revise, branch alternatives.',
    '@modelcontextprotocol/server-sequential-thinking',
    '1.0.0',
    'reasoning',
    'stdio',
    ARRAY[]::TEXT[],
    '[{"name": "sequentialthinking", "description": "Dynamic problem-solving through thought sequences"}]'::jsonb,
    'Most popular MCP server for structured reasoning.',
    'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
    'Anthropic',
    true, true, NOW()
  ),
  (
    'BrowserBase',
    'Cloud browser automation with Stagehand. Navigate pages, extract data, take screenshots, fill forms with AI-powered precision.',
    '@browserbasehq/mcp-server-browserbase',
    '1.0.0',
    'web',
    'stdio',
    ARRAY[]::TEXT[],
    '[
      {"name": "browserbase_create_session", "description": "Create a new cloud browser session"},
      {"name": "browserbase_navigate", "description": "Navigate to a URL"},
      {"name": "browserbase_screenshot", "description": "Take a screenshot of the current page"},
      {"name": "browserbase_click", "description": "Click an element on the page"},
      {"name": "browserbase_fill", "description": "Fill an input field"},
      {"name": "browserbase_extract", "description": "Extract structured data from the page"},
      {"name": "browserbase_close_session", "description": "Close a browser session"}
    ]'::jsonb,
    'Requires BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID env vars.',
    'https://github.com/browserbase/mcp-server-browserbase',
    'BrowserBase',
    true, true, NOW()
  )
ON CONFLICT (mcp_package) DO NOTHING;
