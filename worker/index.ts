import { hostname } from "os";
import { createClient } from "@supabase/supabase-js";
import type { Job, ExecutionState, WorkerConfig } from "../src/types";

// Environment validation
const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "E2B_API_KEY",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Supabase client for worker (uses service role key)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// Worker configuration
const config: WorkerConfig = {
  workerId: `${hostname()}-${process.pid}`,
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || "3", 10),
  pollInterval: parseInt(process.env.WORKER_POLL_INTERVAL_MS || "1000", 10),
  heartbeatInterval: parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS || "30000", 10),
  shutdownTimeout: parseInt(process.env.WORKER_SHUTDOWN_TIMEOUT_MS || "30000", 10),
};

// Worker state
let running = false;
let shuttingDown = false;
const activeJobs = new Map<string, AbortController>();

/**
 * Main worker entry point
 */
async function main() {
  console.log(`Worker starting: ${config.workerId}`);
  console.log(`Concurrency: ${config.concurrency}`);
  console.log(`Poll interval: ${config.pollInterval}ms`);

  running = true;

  // Register signal handlers
  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);

  // Start heartbeat
  startHeartbeat();

  // Start stale job recovery (runs every 2 minutes)
  startStaleJobRecovery();

  // Main polling loop
  await pollLoop();
}

/**
 * Poll for jobs
 */
async function pollLoop() {
  while (running && !shuttingDown) {
    try {
      // Only poll if we have capacity
      if (activeJobs.size < config.concurrency) {
        const job = await claimNextJob();
        if (job) {
          // Execute job in background (non-blocking)
          executeJob(job);
        }
      }
    } catch (error) {
      console.error("Poll error:", error);
    }

    await sleep(config.pollInterval);
  }
}

/**
 * Claim the next available job
 */
async function claimNextJob(): Promise<Job | null> {
  const { data, error } = await supabase.rpc("claim_next_job", {
    p_worker_id: config.workerId,
  });

  if (error) {
    console.error("Failed to claim job:", error);
    return null;
  }

  return data && data.length > 0 ? data[0] : null;
}

/**
 * Execute a job
 */
async function executeJob(job: Job) {
  const controller = new AbortController();
  activeJobs.set(job.id, controller);

  console.log(`Executing job ${job.id}: ${job.task.substring(0, 50)}...`);

  try {
    await addLog(job.id, `Worker ${config.workerId} started job`, "info");

    // Run in sandbox
    const result = await runInSandbox(job, controller.signal);

    if (result.hitlPaused) {
      // Job is paused for user input
      await pauseForUserInput(job.id, result.question!, result.executionState!);
      console.log(`Job ${job.id} paused for user input`);
    } else if (result.success) {
      // Job completed successfully
      await completeJob(job.id, result.result || "");
      console.log(`Job ${job.id} completed`);
    } else {
      // Job failed
      await failJob(job.id, result.error || "Unknown error");
      console.log(`Job ${job.id} failed: ${result.error}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof Error && error.name === "AbortError") {
      // Job was cancelled during shutdown - release it
      await releaseJob(job.id);
      console.log(`Job ${job.id} released (worker shutdown)`);
    } else {
      // Unexpected error
      await failJob(job.id, message);
      console.error(`Job ${job.id} error:`, error);
    }
  } finally {
    activeJobs.delete(job.id);
    await updateHeartbeat();
  }
}

/**
 * Run job in E2B sandbox
 */
async function runInSandbox(
  job: Job,
  signal: AbortSignal
): Promise<{
  success: boolean;
  result?: string;
  error?: string;
  hitlPaused?: boolean;
  question?: string;
  executionState?: ExecutionState;
}> {
  // Dynamic import to avoid loading E2B unless needed
  const { Sandbox } = await import("e2b");

  let sandbox: InstanceType<typeof Sandbox> | null = null;
  const HITL_EXIT_CODE = 100;

  try {
    // Create sandbox
    sandbox = await Sandbox.create({
      timeoutMs: job.timeout_seconds * 1000,
    });

    await addLog(job.id, `Sandbox created: ${sandbox.sandboxId}`, "debug");

    // Check for abort
    if (signal.aborted) {
      throw new Error("Job was cancelled");
    }

    // Install packages if any were discovered
    const packages = job.tools_discovered || [];
    if (packages.length > 0) {
      await addLog(job.id, `Installing packages: ${packages.join(", ")}`, "info");

      const installResult = await sandbox.commands.run(
        `pip install ${packages.join(" ")}`,
        { timeoutMs: 120000 }
      );

      if (installResult.exitCode !== 0) {
        throw new Error(`Package installation failed: ${installResult.stderr}`);
      }
    }

    // Check for abort
    if (signal.aborted) {
      throw new Error("Job was cancelled");
    }

    // Build and run agent script
    const script = buildAgentScript(job);
    await sandbox.files.write("/home/user/agent_runner.py", script);

    await addLog(job.id, "Executing agent...", "info");

    const execution = await sandbox.commands.run(
      "python /home/user/agent_runner.py",
      {
        timeoutMs: job.timeout_seconds * 1000,
        onStdout: (data) => addLog(job.id, data, "info").catch(() => {}),
        onStderr: (data) => addLog(job.id, data, "warn").catch(() => {}),
      }
    );

    // Check for HITL pause
    if (execution.exitCode === HITL_EXIT_CODE) {
      const { question, state } = parseHitlOutput(execution.stdout);

      // Collect artifacts before returning
      await collectArtifacts(sandbox, job.id);

      return {
        success: true,
        hitlPaused: true,
        question,
        executionState: state,
      };
    }

    // Check for error
    if (execution.exitCode !== 0) {
      return {
        success: false,
        error: execution.stderr || `Process exited with code ${execution.exitCode}`,
      };
    }

    // Collect artifacts
    await collectArtifacts(sandbox, job.id);

    // Parse result
    const result = parseAgentResult(execution.stdout);

    return { success: true, result };
  } finally {
    // Always kill sandbox
    if (sandbox) {
      try {
        await sandbox.kill();
      } catch {
        // Ignore
      }
    }
  }
}

/**
 * Build agent runner script
 */
function buildAgentScript(job: Job): string {
  const stateJson = job.execution_state ? JSON.stringify(job.execution_state) : "null";
  const userAnswer = job.user_answer ? JSON.stringify(job.user_answer) : "null";

  return `
import json
import sys

RESTORED_STATE = ${stateJson}
USER_ANSWER = ${userAnswer}
TASK = ${JSON.stringify(job.task)}
TOOLS = ${JSON.stringify(job.tools_discovered || [])}

class CheckpointableAgent:
    def __init__(self, restored_state=None):
        if restored_state:
            self.restore(restored_state)
        else:
            self.state = {}
            self.current_checkpoint = "start"

    def checkpoint(self):
        return {"variables": self.state, "checkpoint": self.current_checkpoint}

    def restore(self, state):
        self.state = state.get("variables", {})
        self.current_checkpoint = state.get("checkpoint", "start")

    def request_user_input(self, question):
        print(f"__HITL_REQUEST__:{json.dumps({'question': question})}")
        print(f"__CHECKPOINT__:{json.dumps(self.checkpoint())}")
        sys.exit(100)

    def emit_result(self, result):
        print(f"__RESULT__:{json.dumps({'result': str(result)})}")

class DefaultAgent(CheckpointableAgent):
    def run(self, task, tools, user_answer=None):
        if user_answer:
            self.state["user_answer"] = user_answer

        try:
            result = f"Executed task: {task}"
            if tools:
                result += f"\\nUsing tools: {', '.join(tools)}"
            self.emit_result(result)
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)

if __name__ == "__main__":
    agent = DefaultAgent(RESTORED_STATE)
    agent.run(TASK, TOOLS, USER_ANSWER)
`;
}

/**
 * Parse HITL output
 */
function parseHitlOutput(stdout: string): { question: string; state: ExecutionState } {
  const lines = stdout.split("\n");
  let question = "";
  let state: ExecutionState = {
    checkpoint: "unknown",
    context: {
      variables: {},
      files_created: [],
      conversation_history: [],
      packages_installed: [],
    },
    sandbox_id: null,
    resumed_count: 0,
    last_checkpoint_at: new Date().toISOString(),
  };

  for (const line of lines) {
    if (line.startsWith("__HITL_REQUEST__:")) {
      try {
        const data = JSON.parse(line.substring("__HITL_REQUEST__:".length));
        question = data.question;
      } catch {}
    }
    if (line.startsWith("__CHECKPOINT__:")) {
      try {
        const data = JSON.parse(line.substring("__CHECKPOINT__:".length));
        state = {
          ...state,
          checkpoint: data.checkpoint || "unknown",
          context: { ...state.context, variables: data.variables || {} },
        };
      } catch {}
    }
  }

  return { question, state };
}

/**
 * Parse agent result
 */
function parseAgentResult(stdout: string): string {
  const lines = stdout.split("\n");

  for (const line of lines) {
    if (line.startsWith("__RESULT__:")) {
      try {
        const data = JSON.parse(line.substring("__RESULT__:".length));
        return data.result;
      } catch {}
    }
  }

  return stdout;
}

/**
 * Collect artifacts from sandbox
 */
async function collectArtifacts(sandbox: any, jobId: string) {
  const ARTIFACT_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".csv", ".json", ".pdf", ".html", ".txt", ".md"];

  try {
    const files = await sandbox.files.list("/home/user");

    for (const file of files) {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!ARTIFACT_EXTENSIONS.includes(ext)) continue;

      try {
        const content = await sandbox.files.read(`/home/user/${file.name}`);
        const storagePath = `artifacts/${jobId}/${file.name}`;

        const { error: uploadError } = await supabase.storage
          .from("job-files")
          .upload(storagePath, content, { upsert: true });

        if (uploadError) continue;

        const { data: urlData } = supabase.storage
          .from("job-files")
          .getPublicUrl(storagePath);

        await supabase.from("job_artifacts").insert({
          job_id: jobId,
          filename: file.name,
          storage_path: storagePath,
          public_url: urlData.publicUrl,
          size_bytes: typeof content === "string" ? content.length : content.byteLength,
        });
      } catch {}
    }
  } catch {}
}

/**
 * Update job status helpers
 */
async function completeJob(jobId: string, result: string) {
  await supabase
    .from("job_queue")
    .update({
      status: "completed",
      result,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

async function failJob(jobId: string, error: string) {
  await supabase
    .from("job_queue")
    .update({
      status: "failed",
      error_message: error,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

async function releaseJob(jobId: string) {
  await supabase
    .from("job_queue")
    .update({
      status: "queued",
      worker_id: null,
      started_at: null,
    })
    .eq("id", jobId);
}

async function pauseForUserInput(jobId: string, question: string, state: ExecutionState) {
  await supabase
    .from("job_queue")
    .update({
      status: "waiting_for_user",
      agent_question: question,
      execution_state: state,
      paused_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

/**
 * Add job log
 */
async function addLog(jobId: string, message: string, level: string) {
  await supabase.from("job_logs").insert({
    job_id: jobId,
    message,
    level,
  });
}

/**
 * Heartbeat
 */
async function updateHeartbeat() {
  await supabase.from("workers").upsert({
    id: config.workerId,
    last_heartbeat: new Date().toISOString(),
    active_jobs: activeJobs.size,
    status: shuttingDown ? "draining" : "active",
    hostname: hostname(),
    version: "1.0.0",
  });
}

function startHeartbeat() {
  updateHeartbeat();
  setInterval(updateHeartbeat, config.heartbeatInterval);
}

/**
 * Stale job recovery
 */
function startStaleJobRecovery() {
  setInterval(async () => {
    try {
      const staleThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: count } = await supabase.rpc("recover_stale_jobs", {
        p_stale_threshold: staleThreshold,
      });

      if (count && count > 0) {
        console.log(`Recovered ${count} stale jobs`);
      }
    } catch (error) {
      console.error("Stale job recovery error:", error);
    }
  }, 2 * 60 * 1000); // Every 2 minutes
}

/**
 * Graceful shutdown
 */
async function gracefulShutdown() {
  if (shuttingDown) return;

  console.log("Graceful shutdown initiated...");
  shuttingDown = true;
  running = false;

  // Update status
  await updateHeartbeat();

  // Wait for active jobs
  const deadline = Date.now() + config.shutdownTimeout;

  while (activeJobs.size > 0 && Date.now() < deadline) {
    console.log(`Waiting for ${activeJobs.size} jobs to complete...`);
    await sleep(1000);
  }

  // Abort remaining jobs
  if (activeJobs.size > 0) {
    console.log(`Aborting ${activeJobs.size} remaining jobs...`);
    activeJobs.forEach((controller) => {
      controller.abort();
    });
    await sleep(1000);
  }

  // Mark worker as dead
  await supabase
    .from("workers")
    .update({ status: "dead" })
    .eq("id", config.workerId);

  console.log("Worker shutdown complete");
  process.exit(0);
}

/**
 * Utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Start worker
main().catch((error) => {
  console.error("Worker fatal error:", error);
  process.exit(1);
});
