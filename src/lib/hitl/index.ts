import { getSupabaseAdmin } from "@/lib/db";
import { addJobLog } from "@/lib/queue";
import type { ExecutionState, Job } from "@/types";

/**
 * Pause a job for user input (HITL)
 * This is called when the sandbox detects a HITL request
 */
export async function pauseForUserInput(
  jobId: string,
  question: string,
  executionState: ExecutionState
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Update the state with current timestamp
  const updatedState: ExecutionState = {
    ...executionState,
    sandbox_id: null, // Sandbox is being killed
    last_checkpoint_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("job_queue")
    .update({
      status: "waiting_for_user",
      agent_question: question,
      execution_state: updatedState,
      paused_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(`Failed to pause job for user input: ${error.message}`);
  }

  await addJobLog(jobId, `Paused for user input: ${question}`, "info");
}

/**
 * Resume a job after user provides input
 */
export async function resumeFromUserInput(
  jobId: string,
  userAnswer: string
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
  const currentState = (job.execution_state || {}) as ExecutionState;
  const updatedState: ExecutionState = {
    ...currentState,
    context: {
      variables: currentState.context?.variables || {},
      files_created: currentState.context?.files_created || [],
      conversation_history: [
        ...(currentState.context?.conversation_history || []),
        { role: "user", content: userAnswer },
      ],
      packages_installed: currentState.context?.packages_installed || [],
    },
    resumed_count: (currentState.resumed_count || 0) + 1,
  };

  // Re-queue the job for processing
  const { error: updateError } = await supabase
    .from("job_queue")
    .update({
      status: "queued",
      user_answer: userAnswer,
      execution_state: updatedState,
      agent_question: null, // Clear the question
      paused_at: null,
    })
    .eq("id", jobId);

  if (updateError) {
    throw new Error(`Failed to resume job: ${updateError.message}`);
  }

  await addJobLog(jobId, `Resumed with user answer`, "info");
}

/**
 * Check if a job is waiting for user input
 */
export async function isWaitingForUser(jobId: string): Promise<{
  waiting: boolean;
  question?: string;
}> {
  const supabase = getSupabaseAdmin();

  const { data: job, error } = await supabase
    .from("job_queue")
    .select("status, agent_question")
    .eq("id", jobId)
    .single();

  if (error) {
    throw new Error(`Job not found: ${error.message}`);
  }

  return {
    waiting: job.status === "waiting_for_user",
    question: job.agent_question || undefined,
  };
}

/**
 * Get jobs waiting for user input (for a specific API key)
 */
export async function getJobsWaitingForInput(apiKeyId?: string): Promise<Job[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("job_queue")
    .select()
    .eq("status", "waiting_for_user")
    .order("paused_at", { ascending: false });

  if (apiKeyId) {
    query = query.eq("api_key_id", apiKeyId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get jobs waiting for input: ${error.message}`);
  }

  return data as Job[];
}
