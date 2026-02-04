// Job statuses
export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "waiting_for_user"
  | "cancelled";

// Log levels
export type LogLevel = "debug" | "info" | "warn" | "error";

// Worker statuses
export type WorkerStatus = "active" | "draining" | "dead";

// API Key scopes
export type ApiScope =
  | "jobs:read"
  | "jobs:write"
  | "jobs:delete"
  | "agents:read"
  | "agents:write"
  | "admin";

// Execution state for HITL checkpoint/resume
export interface ExecutionState {
  checkpoint: string;
  context: {
    variables: Record<string, unknown>;
    files_created: string[];
    conversation_history: ConversationMessage[];
    packages_installed: string[];
  };
  sandbox_id: string | null;
  resumed_count: number;
  last_checkpoint_at: string;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// Database models
export interface ApiKey {
  id: string;
  key_prefix: string;
  key_hash: string;
  name: string;
  owner_email: string | null;
  scopes: ApiScope[];
  rate_limit_rpm: number;
  is_active: boolean;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
  last_used_at: string | null;
  total_requests: number;
  metadata: Record<string, unknown>;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  package_name: string;
  version: string;
  embedding: number[] | null;
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  task: string;
  priority: number;
  timeout_seconds: number;
  status: JobStatus;
  tools_discovered: string[] | null;
  worker_id: string | null;
  execution_state: ExecutionState | null;
  result: string | null;
  error_message: string | null;
  agent_question: string | null;
  user_answer: string | null;
  retry_count: number;
  max_retries: number;
  api_key_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
}

export interface JobLog {
  id: number;
  job_id: string;
  level: LogLevel;
  message: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

export interface JobArtifact {
  id: string;
  job_id: string;
  filename: string;
  mime_type: string | null;
  storage_path: string;
  public_url: string;
  size_bytes: number | null;
  created_at: string;
}

export interface Worker {
  id: string;
  last_heartbeat: string;
  active_jobs: number;
  status: WorkerStatus;
  hostname: string | null;
  version: string | null;
  created_at: string;
}

// API request/response types
export interface CreateJobRequest {
  task: string;
  priority?: number;
  timeout_seconds?: number;
}

export interface CreateJobResponse {
  id: string;
  status: JobStatus;
  created_at: string;
}

export interface JobResponse extends Job {
  artifacts?: JobArtifact[];
  logs?: JobLog[];
}

export interface RespondToJobRequest {
  answer: string;
}

export interface DiscoverAgentsRequest {
  task: string;
  threshold?: number;
  limit?: number;
}

export interface DiscoverAgentsResponse {
  agents: Array<{
    id: string;
    name: string;
    package_name: string;
    similarity: number;
  }>;
}

export interface ApiKeyValidation {
  valid: boolean;
  error?: string;
  keyId?: string;
  scopes?: ApiScope[];
  rateLimitRpm?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  remaining?: number;
}

// Worker types
export interface WorkerConfig {
  workerId: string;
  concurrency: number;
  pollInterval: number;
  heartbeatInterval: number;
  shutdownTimeout: number;
}

// Error types
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}
