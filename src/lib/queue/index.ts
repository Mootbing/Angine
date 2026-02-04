import { getSupabaseAdmin } from "@/lib/db";
import type { Job, JobStatus, LogLevel, ExecutionState } from "@/types";

/**
 * Enqueue a new job
 */
export async function enqueueJob(params: {
  task: string;
  apiKeyId: string;
  priority?: number;
  timeoutSeconds?: number;
}): Promise<Job> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("job_queue")
    .insert({
      task: params.task,
      api_key_id: params.apiKeyId,
      priority: params.priority ?? 0,
      timeout_seconds: params.timeoutSeconds ?? 300,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to enqueue job: ${error.message}`);
  }

  return data as Job;
}

/**
 * Claim the next available job (atomic with SKIP LOCKED)
 */
export async function claimNextJob(workerId: string): Promise<Job | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc("claim_next_job", {
    p_worker_id: workerId,
  });

  if (error) {
    throw new Error(`Failed to claim job: ${error.message}`);
  }

  // RPC returns an array, get first element
  return data && data.length > 0 ? (data[0] as Job) : null;
}

/**
 * Update job status
 */
export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  extra?: Partial<Pick<Job, "result" | "error_message" | "execution_state" | "agent_question">>
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const update: Record<string, unknown> = { status };

  if (status === "completed" || status === "failed") {
    update.completed_at = new Date().toISOString();
  }

  if (status === "waiting_for_user") {
    update.paused_at = new Date().toISOString();
  }

  if (extra?.result !== undefined) update.result = extra.result;
  if (extra?.error_message !== undefined) update.error_message = extra.error_message;
  if (extra?.execution_state !== undefined) update.execution_state = extra.execution_state;
  if (extra?.agent_question !== undefined) update.agent_question = extra.agent_question;

  const { error } = await supabase
    .from("job_queue")
    .update(update)
    .eq("id", jobId);

  if (error) {
    throw new Error(`Failed to update job status: ${error.message}`);
  }
}

/**
 * Release a job back to the queue (e.g., on worker shutdown)
 */
export async function releaseJob(jobId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("job_queue")
    .update({
      status: "queued",
      worker_id: null,
      started_at: null,
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(`Failed to release job: ${error.message}`);
  }
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string): Promise<Job | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("job_queue")
    .select()
    .eq("id", jobId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw new Error(`Failed to get job: ${error.message}`);
  }

  return data as Job;
}

/**
 * List jobs with optional filters
 */
export async function listJobs(params?: {
  apiKeyId?: string;
  status?: JobStatus;
  limit?: number;
  offset?: number;
}): Promise<Job[]> {
  const supabase = getSupabaseAdmin();
  const { apiKeyId, status, limit = 50, offset = 0 } = params || {};

  let query = supabase
    .from("job_queue")
    .select()
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (apiKeyId) {
    query = query.eq("api_key_id", apiKeyId);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list jobs: ${error.message}`);
  }

  return data as Job[];
}

/**
 * Add a log entry for a job
 */
export async function addJobLog(
  jobId: string,
  message: string,
  level: LogLevel = "info",
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("job_logs").insert({
    job_id: jobId,
    message,
    level,
    metadata: metadata || null,
  });

  if (error) {
    // Don't throw on log failures, just warn
    console.warn(`Failed to add job log: ${error.message}`);
  }
}

/**
 * Get logs for a job
 */
export async function getJobLogs(
  jobId: string,
  params?: { limit?: number; offset?: number }
): Promise<Array<{ id: number; level: string; message: string; timestamp: string; metadata: Record<string, unknown> | null }>> {
  const supabase = getSupabaseAdmin();
  const { limit = 100, offset = 0 } = params || {};

  const { data, error } = await supabase
    .from("job_logs")
    .select("id, level, message, timestamp, metadata")
    .eq("job_id", jobId)
    .order("timestamp", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to get job logs: ${error.message}`);
  }

  return data;
}

/**
 * Record discovered tools for a job
 */
export async function setDiscoveredTools(
  jobId: string,
  tools: string[]
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("job_queue")
    .update({ tools_discovered: tools })
    .eq("id", jobId);

  if (error) {
    throw new Error(`Failed to set discovered tools: ${error.message}`);
  }
}

/**
 * Handle user response to HITL question
 */
export async function respondToJob(
  jobId: string,
  answer: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Get current job state
  const { data: job, error: getError } = await supabase
    .from("job_queue")
    .select("execution_state, status")
    .eq("id", jobId)
    .single();

  if (getError) {
    throw new Error(`Job not found: ${getError.message}`);
  }

  if (job.status !== "waiting_for_user") {
    throw new Error(`Job is not waiting for user input (status: ${job.status})`);
  }

  // Update execution state with user's answer
  const executionState = (job.execution_state || {}) as ExecutionState;
  const updatedState: ExecutionState = {
    ...executionState,
    context: {
      ...executionState.context,
      conversation_history: [
        ...(executionState.context?.conversation_history || []),
        { role: "user", content: answer },
      ],
    },
    resumed_count: (executionState.resumed_count || 0) + 1,
  };

  // Re-queue the job
  const { error: updateError } = await supabase
    .from("job_queue")
    .update({
      status: "queued",
      user_answer: answer,
      execution_state: updatedState,
      agent_question: null,
      paused_at: null,
    })
    .eq("id", jobId);

  if (updateError) {
    throw new Error(`Failed to respond to job: ${updateError.message}`);
  }
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("job_queue")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .in("status", ["queued", "waiting_for_user"]); // Can only cancel if not running

  if (error) {
    throw new Error(`Failed to cancel job: ${error.message}`);
  }
}
