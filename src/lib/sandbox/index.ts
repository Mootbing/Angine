import { Sandbox } from "e2b";
import { getSupabaseAdmin } from "@/lib/db";
import { addJobLog, updateJobStatus } from "@/lib/queue";
import type { Job, ExecutionState, JobArtifact } from "@/types";

// Exit code used by agent to signal HITL pause
const HITL_EXIT_CODE = 100;

// Artifact extensions to collect
const ARTIFACT_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".csv", ".json", ".pdf", ".html", ".txt", ".md"];

interface SandboxResult {
  success: boolean;
  result?: string;
  error?: string;
  hitlPaused?: boolean;
  question?: string;
  executionState?: ExecutionState;
}

/**
 * Run a job in an E2B sandbox
 */
export async function runInSandbox(
  job: Job,
  packages: string[],
  signal?: AbortSignal
): Promise<SandboxResult> {
  let sandbox: Sandbox | null = null;

  try {
    await addJobLog(job.id, `Starting sandbox for job ${job.id}`, "info");

    // Create sandbox with timeout
    sandbox = await Sandbox.create({
      timeoutMs: job.timeout_seconds * 1000,
    });

    await addJobLog(job.id, `Sandbox created: ${sandbox.sandboxId}`, "debug");

    // Check for abort before proceeding
    if (signal?.aborted) {
      throw new Error("Job was cancelled");
    }

    // Install required packages
    if (packages.length > 0) {
      await addJobLog(job.id, `Installing packages: ${packages.join(", ")}`, "info");

      const installResult = await sandbox.commands.run(
        `pip install ${packages.join(" ")}`,
        { timeoutMs: 120000 }
      );

      if (installResult.exitCode !== 0) {
        throw new Error(`Package installation failed: ${installResult.stderr}`);
      }
    }

    // Check for abort
    if (signal?.aborted) {
      throw new Error("Job was cancelled");
    }

    // Build the agent runner script
    const agentScript = buildAgentScript(job);

    // Write script to sandbox
    await sandbox.files.write("/home/user/agent_runner.py", agentScript);

    // Execute the agent
    await addJobLog(job.id, "Executing agent...", "info");

    const execution = await sandbox.commands.run("python /home/user/agent_runner.py", {
      timeoutMs: job.timeout_seconds * 1000,
      onStdout: (data) => {
        // Stream stdout to logs
        addJobLog(job.id, data, "info").catch(() => {});
      },
      onStderr: (data) => {
        // Stream stderr to logs
        addJobLog(job.id, data, "warn").catch(() => {});
      },
    });

    // Check for HITL pause
    if (execution.exitCode === HITL_EXIT_CODE) {
      const { question, state } = parseHitlOutput(execution.stdout);

      // Collect artifacts before pausing
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

    // Parse result from stdout
    const result = parseAgentResult(execution.stdout);

    return {
      success: true,
      result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await addJobLog(job.id, `Sandbox error: ${message}`, "error");

    return {
      success: false,
      error: message,
    };
  } finally {
    // Always kill sandbox to stop billing
    if (sandbox) {
      try {
        await sandbox.kill();
        await addJobLog(job.id, "Sandbox terminated", "debug");
      } catch {
        // Ignore kill errors
      }
    }
  }
}

/**
 * Build the Python agent runner script
 */
function buildAgentScript(job: Job): string {
  const isResume = job.execution_state !== null;
  const stateJson = job.execution_state ? JSON.stringify(job.execution_state) : "null";
  const userAnswer = job.user_answer ? JSON.stringify(job.user_answer) : "null";

  return `
import json
import sys

# Execution state from previous run (if resuming)
RESTORED_STATE = ${stateJson}
USER_ANSWER = ${userAnswer}

# Task to execute
TASK = ${JSON.stringify(job.task)}

# Discovered tools/packages
TOOLS = ${JSON.stringify(job.tools_discovered || [])}

class CheckpointableAgent:
    """Base class for agents that support HITL checkpoint/resume"""

    def __init__(self, restored_state=None):
        if restored_state:
            self.restore(restored_state)
        else:
            self.state = {}
            self.current_checkpoint = "start"

    def checkpoint(self):
        """Serialize current state for persistence"""
        return {
            "variables": self.state,
            "checkpoint": self.current_checkpoint
        }

    def restore(self, state):
        """Restore from persisted state"""
        self.state = state.get("variables", {})
        self.current_checkpoint = state.get("checkpoint", "start")

    def request_user_input(self, question):
        """Signal need for human input - triggers HITL pause"""
        print(f"__HITL_REQUEST__:{json.dumps({'question': question})}")
        print(f"__CHECKPOINT__:{json.dumps(self.checkpoint())}")
        sys.exit(100)  # Special exit code for HITL pause

    def emit_result(self, result):
        """Emit the final result"""
        print(f"__RESULT__:{json.dumps({'result': str(result)})}")

# Default agent implementation
class DefaultAgent(CheckpointableAgent):
    def run(self, task, tools, user_answer=None):
        # If resuming, check for user answer
        if user_answer:
            self.state["user_answer"] = user_answer

        # Simple execution - just run the task
        try:
            # For demo: execute the task description as a basic operation
            result = f"Executed task: {task}"

            # If tools were discovered, note them
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
 * Parse HITL output from agent stdout
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
      } catch {
        // Ignore parse errors
      }
    }
    if (line.startsWith("__CHECKPOINT__:")) {
      try {
        const data = JSON.parse(line.substring("__CHECKPOINT__:".length));
        state = {
          ...state,
          checkpoint: data.checkpoint || "unknown",
          context: {
            ...state.context,
            variables: data.variables || {},
          },
        };
      } catch {
        // Ignore parse errors
      }
    }
  }

  return { question, state };
}

/**
 * Parse result from agent stdout
 */
function parseAgentResult(stdout: string): string {
  const lines = stdout.split("\n");

  for (const line of lines) {
    if (line.startsWith("__RESULT__:")) {
      try {
        const data = JSON.parse(line.substring("__RESULT__:".length));
        return data.result;
      } catch {
        // Fall through
      }
    }
  }

  // If no structured result, return full stdout
  return stdout;
}

/**
 * Collect artifacts from sandbox and upload to storage
 */
async function collectArtifacts(sandbox: Sandbox, jobId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  try {
    // List files in the working directory
    const files = await sandbox.files.list("/home/user");

    for (const file of files) {
      // Check if it's an artifact we should collect
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!ARTIFACT_EXTENSIONS.includes(ext)) continue;

      try {
        // Read file content
        const content = await sandbox.files.read(`/home/user/${file.name}`);

        // Upload to Supabase Storage
        const storagePath = `artifacts/${jobId}/${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("job-files")
          .upload(storagePath, content, {
            contentType: getMimeType(ext),
            upsert: true,
          });

        if (uploadError) {
          console.warn(`Failed to upload artifact ${file.name}:`, uploadError);
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("job-files")
          .getPublicUrl(storagePath);

        // Record in database
        const contentSize = typeof content === 'string'
          ? content.length
          : (content as ArrayBuffer).byteLength || 0;

        await supabase.from("job_artifacts").insert({
          job_id: jobId,
          filename: file.name,
          mime_type: getMimeType(ext),
          storage_path: storagePath,
          public_url: urlData.publicUrl,
          size_bytes: contentSize,
        });

        await addJobLog(jobId, `Collected artifact: ${file.name}`, "info");
      } catch (err) {
        console.warn(`Failed to collect artifact ${file.name}:`, err);
      }
    }
  } catch (err) {
    console.warn("Failed to list sandbox files:", err);
  }
}

/**
 * Get MIME type from file extension
 */
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".csv": "text/csv",
    ".json": "application/json",
    ".pdf": "application/pdf",
    ".html": "text/html",
    ".txt": "text/plain",
    ".md": "text/markdown",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Get artifacts for a job
 */
export async function getJobArtifacts(jobId: string): Promise<JobArtifact[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("job_artifacts")
    .select()
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to get job artifacts: ${error.message}`);
  }

  return data as JobArtifact[];
}
