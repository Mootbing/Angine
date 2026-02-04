import { hostname } from "os";
import { createClient } from "@supabase/supabase-js";
import type { Job, ExecutionState, WorkerConfig } from "../src/types";

// Environment validation
const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "E2B_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
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
 * MCP Server interface from database
 */
interface MCPServer {
  id: string;
  name: string;
  description: string;
  mcp_package: string;
  mcp_transport: string;
  mcp_args: string[];
  mcp_env: Record<string, string>;
  mcp_tools: Array<{ name: string; description: string }>;
  documentation: string | null;
}

/**
 * Generate embedding using OpenAI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
      dimensions: 1536,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI embedding error: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Search for relevant MCP servers using vector similarity
 */
async function discoverMCPServers(task: string, jobId: string): Promise<MCPServer[]> {
  try {
    await addLog(jobId, "Searching for relevant MCP servers...", "info");

    // Generate embedding for the task
    const embedding = await generateEmbedding(task);

    // Query matching agents using vector similarity
    const { data, error } = await supabase.rpc("match_agents", {
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: 5,
    });

    if (error) {
      console.error("MCP server discovery error:", error);
      return [];
    }

    if (!data || data.length === 0) {
      await addLog(jobId, "No specific MCP servers found", "debug");
      return [];
    }

    // Fetch full MCP server details
    const serverIds = data.map((t: any) => t.id);
    const { data: servers, error: fetchError } = await supabase
      .from("agents")
      .select("id, name, description, mcp_package, mcp_transport, mcp_args, mcp_env, mcp_tools, documentation")
      .in("id", serverIds);

    if (fetchError || !servers) {
      return [];
    }

    await addLog(jobId, `Found ${servers.length} relevant MCP servers: ${servers.map((s: MCPServer) => s.name).join(", ")}`, "info");
    return servers as MCPServer[];
  } catch (err) {
    console.error("MCP server discovery failed:", err);
    return [];
  }
}

/**
 * Attachment interface
 */
interface Attachment {
  id: string;
  filename: string;
  mime_type: string | null;
  storage_path: string;
  public_url: string;
  size_bytes: number | null;
}

/**
 * Fetch attachments for a job
 */
async function fetchJobAttachments(jobId: string): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from("job_attachments")
    .select("*")
    .eq("job_id", jobId);

  if (error || !data) {
    return [];
  }

  return data as Attachment[];
}

/**
 * Download attachments into sandbox
 */
async function downloadAttachmentsToSandbox(
  sandbox: any,
  attachments: Attachment[],
  jobId: string
): Promise<string[]> {
  const downloadedPaths: string[] = [];

  for (const attachment of attachments) {
    try {
      // Fetch file from public URL
      const response = await fetch(attachment.public_url);
      if (!response.ok) {
        console.warn(`Failed to download ${attachment.filename}: ${response.status}`);
        continue;
      }

      const buffer = await response.arrayBuffer();
      const sandboxPath = `/home/user/attachments/${attachment.filename}`;

      // Create attachments directory if needed
      await sandbox.commands.run("mkdir -p /home/user/attachments");

      // Write file to sandbox
      await sandbox.files.write(sandboxPath, new Uint8Array(buffer));
      downloadedPaths.push(sandboxPath);

      await addLog(jobId, `Downloaded attachment: ${attachment.filename}`, "debug");
    } catch (err) {
      console.warn(`Failed to download attachment ${attachment.filename}:`, err);
    }
  }

  return downloadedPaths;
}

/**
 * Build the system prompt with discovered MCP servers
 */
function buildSystemPrompt(mcpServers: MCPServer[], attachments: Attachment[] = []): string {
  let prompt = `You are a Python code generator. Generate ONLY executable Python code that accomplishes the user's task.

Rules:
1. Output ONLY valid Python code - no markdown, no explanations, no code blocks
2. Print the final result using print()
3. If you need user input, use: print("__NEED_INPUT__: <your question>") and exit(100)
4. Handle errors gracefully
5. For file operations, save files to /home/user/
6. Keep code concise and efficient`;

  // Add attachment information if present
  if (attachments.length > 0) {
    prompt += `\n\n## Input Files\nThe user has provided the following files in /home/user/attachments/:\n`;
    for (const att of attachments) {
      prompt += `- ${att.filename}`;
      if (att.mime_type) prompt += ` (${att.mime_type})`;
      if (att.size_bytes) prompt += ` [${Math.round(att.size_bytes / 1024)}KB]`;
      prompt += `\n`;
    }
    prompt += `\nRead these files from /home/user/attachments/ as needed for the task.`;
  }

  if (mcpServers.length > 0) {
    prompt += `\n\n## Available MCP Server Tools\nYou have access to these tools from MCP servers:\n`;

    for (const server of mcpServers) {
      prompt += `\n### ${server.name}\n`;
      prompt += `Description: ${server.description}\n`;
      prompt += `Package: ${server.mcp_package}\n`;
      if (server.mcp_tools && server.mcp_tools.length > 0) {
        prompt += `Tools:\n`;
        for (const tool of server.mcp_tools) {
          prompt += `  - ${tool.name}: ${tool.description}\n`;
        }
      }
    }
  }

  prompt += `\n\nCommon imports you can use: json, csv, math, random, datetime, re, os, sys, urllib, collections, itertools, requests, pandas, numpy, matplotlib, pillow`;

  return prompt;
}

/**
 * Message for conversation history in code generation
 */
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Call OpenRouter API to generate code
 */
async function callOpenRouter(
  model: string,
  task: string,
  mcpServers: MCPServer[],
  attachments: Attachment[] = [],
  userAnswer?: string | null,
  conversationHistory?: ChatMessage[]
): Promise<{ code: string; messages: ChatMessage[] }> {
  const systemPrompt = buildSystemPrompt(mcpServers, attachments);

  // Build messages array
  let messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  if (conversationHistory && conversationHistory.length > 0) {
    // Continue from existing conversation (for retries)
    messages = [...messages, ...conversationHistory];
  } else {
    // Initial code generation
    const userPrompt = userAnswer
      ? `Previous question was answered: "${userAnswer}"\n\nOriginal task: ${task}\n\nContinue the task with this answer.`
      : `Task: ${task}\n\nGenerate Python code to accomplish this task.`;
    messages.push({ role: "user", content: userPrompt });
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://engine.dev",
      "X-Title": "Engine Platform",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  let code = data.choices[0]?.message?.content || "";

  // Clean up code - remove markdown code blocks if present
  code = code.replace(/^```python\n?/gm, "").replace(/^```\n?/gm, "").trim();

  // Return updated conversation history (excluding system prompt for storage)
  const updatedHistory: ChatMessage[] = conversationHistory
    ? [...conversationHistory, { role: "assistant", content: code }]
    : [
        { role: "user", content: messages[1].content },
        { role: "assistant", content: code },
      ];

  return { code, messages: updatedHistory };
}

/**
 * Run job in E2B sandbox with automatic retry on code errors
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
  const { Sandbox } = await import("e2b");

  let sandbox: InstanceType<typeof Sandbox> | null = null;
  const HITL_EXIT_CODE = 100;
  const MAX_RETRIES = 5; // Max attempts to fix code errors
  const model = (job as any).model || "anthropic/claude-sonnet-4";

  try {
    // Step 1: Discover relevant MCP servers using vector search
    const mcpServers = await discoverMCPServers(job.task, job.id);

    // Step 2: Fetch job attachments
    const attachments = await fetchJobAttachments(job.id);
    if (attachments.length > 0) {
      await addLog(job.id, `Found ${attachments.length} attachment(s): ${attachments.map(a => a.filename).join(", ")}`, "info");
    }

    // Step 3: Create sandbox (reuse for all retries)
    sandbox = await Sandbox.create({
      timeoutMs: job.timeout_seconds * 1000,
    });

    await addLog(job.id, `Sandbox created: ${sandbox.sandboxId}`, "debug");

    if (signal.aborted) {
      throw new Error("Job was cancelled");
    }

    // Step 4: Download attachments into sandbox
    if (attachments.length > 0) {
      await addLog(job.id, "Downloading attachments to sandbox...", "info");
      const downloadedPaths = await downloadAttachmentsToSandbox(sandbox, attachments, job.id);
      await addLog(job.id, `Downloaded ${downloadedPaths.length} file(s) to sandbox`, "info");
    }

    // Step 5: Install common Python packages
    await addLog(job.id, "Installing dependencies...", "info");

    const packagesToInstall = new Set<string>();
    packagesToInstall.add("requests");
    packagesToInstall.add("pandas");
    packagesToInstall.add("numpy");
    packagesToInstall.add("matplotlib");
    packagesToInstall.add("pillow");
    packagesToInstall.add("beautifulsoup4");
    packagesToInstall.add("seaborn");
    packagesToInstall.add("scipy");

    await sandbox.commands.run(
      `pip install ${Array.from(packagesToInstall).join(" ")} -q`,
      { timeoutMs: 120000 }
    );

    if (signal.aborted) {
      throw new Error("Job was cancelled");
    }

    // Step 6: Code generation and execution loop with retries
    let conversationHistory: ChatMessage[] | undefined;
    let currentCode = "";
    let attempt = 0;
    let lastError = "";

    while (attempt < MAX_RETRIES) {
      attempt++;

      if (signal.aborted) {
        throw new Error("Job was cancelled");
      }

      // Generate or fix code
      if (attempt === 1) {
        await addLog(job.id, `Generating code with ${model}...`, "info");
        const result = await callOpenRouter(model, job.task, mcpServers, attachments, job.user_answer);
        currentCode = result.code;
        conversationHistory = result.messages;
      } else {
        await addLog(job.id, `Attempt ${attempt}/${MAX_RETRIES}: Asking ${model} to fix the error...`, "info");

        // Add error feedback to conversation
        const errorFeedback: ChatMessage = {
          role: "user",
          content: `The code failed with the following error:\n\n\`\`\`\n${lastError}\n\`\`\`\n\nPlease fix the code to handle this error. Output ONLY the corrected Python code, no explanations.`,
        };
        conversationHistory = [...(conversationHistory || []), errorFeedback];

        const result = await callOpenRouter(model, job.task, mcpServers, attachments, job.user_answer, conversationHistory);
        currentCode = result.code;
        conversationHistory = result.messages;
      }

      await addLog(job.id, `Generated ${currentCode.length} chars of code (attempt ${attempt})`, "debug");

      // Write and execute the code
      await sandbox.files.write("/home/user/task.py", currentCode);
      await addLog(job.id, `Executing code (attempt ${attempt})...`, "info");

      let stdout = "";
      let stderr = "";

      const execution = await sandbox.commands.run(
        "cd /home/user && python task.py",
        {
          timeoutMs: job.timeout_seconds * 1000,
          onStdout: (data) => {
            stdout += data;
            addLog(job.id, data.trim(), "info").catch(() => {});
          },
          onStderr: (data) => {
            stderr += data;
            addLog(job.id, data.trim(), "warn").catch(() => {});
          },
        }
      );

      // Check for HITL pause
      if (execution.exitCode === HITL_EXIT_CODE || execution.stdout.includes("__NEED_INPUT__:")) {
        const match = execution.stdout.match(/__NEED_INPUT__:\s*(.+)/);
        const question = match ? match[1].trim() : "The agent needs more information";

        await collectArtifacts(sandbox, job.id);

        return {
          success: true,
          hitlPaused: true,
          question,
          executionState: {
            checkpoint: "waiting_for_input",
            context: {
              variables: { generated_code: currentCode },
              files_created: [],
              conversation_history: conversationHistory || [],
              packages_installed: Array.from(packagesToInstall),
            },
            sandbox_id: null,
            resumed_count: 0,
            last_checkpoint_at: new Date().toISOString(),
          },
        };
      }

      // Check for success
      if (execution.exitCode === 0) {
        await collectArtifacts(sandbox, job.id);
        const result = stdout.trim() || "Task completed successfully (no output)";

        if (attempt > 1) {
          await addLog(job.id, `Code succeeded after ${attempt} attempts`, "info");
        }

        return { success: true, result };
      }

      // Execution failed - prepare for retry
      lastError = stderr || `Process exited with code ${execution.exitCode}`;

      // Include partial stdout in error context if helpful
      if (stdout.trim()) {
        lastError = `stdout (partial output before error):\n${stdout.trim()}\n\nstderr:\n${lastError}`;
      }

      await addLog(job.id, `Code execution failed (attempt ${attempt}/${MAX_RETRIES}): ${stderr.substring(0, 200)}...`, "warn");

      // If this was the last attempt, return failure
      if (attempt >= MAX_RETRIES) {
        await addLog(job.id, `Max retries (${MAX_RETRIES}) reached, job failed`, "error");
        return {
          success: false,
          error: `Code failed after ${MAX_RETRIES} attempts. Last error:\n${lastError}`,
        };
      }

      // Continue to next retry attempt
    }

    // Should not reach here, but just in case
    return {
      success: false,
      error: "Unexpected end of retry loop",
    };
  } finally {
    if (sandbox) {
      try {
        await sandbox.kill();
      } catch {}
    }
  }
}

/**
 * Build agent runner script
 */
function buildAgentScript(job: Job): string {
  const stateJson = job.execution_state ? JSON.stringify(job.execution_state) : "None";
  const userAnswer = job.user_answer ? JSON.stringify(job.user_answer) : "None";

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
