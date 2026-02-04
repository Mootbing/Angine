import { hostname } from "os";
import { createClient } from "@supabase/supabase-js";
import type { Job, ExecutionState, WorkerConfig } from "../src/types";

// Environment validation
const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENROUTER_API_KEY",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Supabase client
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

// ============================================
// Tool Definitions
// ============================================

interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// Built-in tools the agent can use
const TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch content from a URL and return it as text. Useful for reading web pages, APIs, or downloading data.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to fetch" },
          method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], description: "HTTP method (default: GET)" },
          headers: { type: "object", description: "Optional headers to send" },
          body: { type: "string", description: "Optional request body for POST/PUT" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_python",
      description: "Execute Python code and return the output. Use for calculations, data processing, file manipulation, or any computational task.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "Python code to execute" },
          packages: { type: "array", items: { type: "string" }, description: "Optional pip packages to install first" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file that was uploaded as an attachment.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "Name of the file to read" },
        },
        required: ["filename"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file. The file will be saved as a job artifact.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "Name of the file to create" },
          content: { type: "string", description: "Content to write to the file" },
        },
        required: ["filename", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description: "Ask the user a question when you need more information to complete the task. The job will pause until the user responds.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The question to ask the user" },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "final_answer",
      description: "Return the final result to the user. Call this when the task is complete.",
      parameters: {
        type: "object",
        properties: {
          answer: { type: "string", description: "The final answer or result" },
        },
        required: ["answer"],
      },
    },
  },
];

// ============================================
// Tool Execution
// ============================================

interface ToolContext {
  jobId: string;
  attachments: Map<string, { content: string; url: string }>;
  artifacts: Map<string, string>;
  sandbox: any | null;
}

async function executeTool(
  toolName: string,
  args: Record<string, any>,
  ctx: ToolContext
): Promise<{ result?: string; askUser?: string; finalAnswer?: string; error?: string }> {
  try {
    switch (toolName) {
      case "fetch_url": {
        const { url, method = "GET", headers = {}, body } = args;
        await addLog(ctx.jobId, `Fetching ${method} ${url}`, "info");

        const response = await fetch(url, {
          method,
          headers: headers as Record<string, string>,
          body: body ? body : undefined,
        });

        const contentType = response.headers.get("content-type") || "";
        let text: string;

        if (contentType.includes("application/json")) {
          const json = await response.json();
          text = JSON.stringify(json, null, 2);
        } else {
          text = await response.text();
        }

        // Truncate if too long
        if (text.length > 50000) {
          text = text.substring(0, 50000) + "\n\n[Truncated - content too long]";
        }

        return { result: `Status: ${response.status}\n\n${text}` };
      }

      case "run_python": {
        const { code, packages = [] } = args;
        await addLog(ctx.jobId, `Running Python code (${code.length} chars)`, "info");

        // Lazy load E2B
        if (!ctx.sandbox) {
          const { Sandbox } = await import("e2b");
          ctx.sandbox = await Sandbox.create({ timeoutMs: 300000 });
          await addLog(ctx.jobId, `Sandbox created: ${ctx.sandbox.sandboxId}`, "debug");

          // Install common packages
          await ctx.sandbox.commands.run(
            "pip install requests pandas numpy matplotlib pillow beautifulsoup4 seaborn scipy -q",
            { timeoutMs: 120000 }
          );
        }

        // Install additional packages if requested
        if (packages.length > 0) {
          await ctx.sandbox.commands.run(
            `pip install ${packages.join(" ")} -q`,
            { timeoutMs: 60000 }
          );
        }

        // Write and execute code
        await ctx.sandbox.files.write("/home/user/script.py", code);
        const result = await ctx.sandbox.commands.run(
          "cd /home/user && python script.py",
          { timeoutMs: 120000 }
        );

        let output = result.stdout || "";
        if (result.stderr) {
          output += `\n\nStderr:\n${result.stderr}`;
        }
        if (result.exitCode !== 0) {
          output += `\n\nExit code: ${result.exitCode}`;
        }

        return { result: output || "(No output)" };
      }

      case "read_file": {
        const { filename } = args;
        await addLog(ctx.jobId, `Reading file: ${filename}`, "info");

        const file = ctx.attachments.get(filename);
        if (!file) {
          const available = Array.from(ctx.attachments.keys()).join(", ") || "none";
          return { error: `File not found: ${filename}. Available files: ${available}` };
        }

        return { result: file.content };
      }

      case "write_file": {
        const { filename, content } = args;
        await addLog(ctx.jobId, `Writing file: ${filename} (${content.length} chars)`, "info");

        ctx.artifacts.set(filename, content);
        return { result: `File saved: ${filename}` };
      }

      case "ask_user": {
        const { question } = args;
        return { askUser: question };
      }

      case "final_answer": {
        const { answer } = args;
        return { finalAnswer: answer };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await addLog(ctx.jobId, `Tool error (${toolName}): ${message}`, "error");
    return { error: message };
  }
}

// ============================================
// Agent Loop
// ============================================

interface AgentResult {
  success: boolean;
  result?: string;
  error?: string;
  askUser?: string;
  executionState?: ExecutionState;
}

async function runAgentLoop(job: Job, signal: AbortSignal): Promise<AgentResult> {
  const model = (job as any).model || "anthropic/claude-sonnet-4";
  const MAX_ITERATIONS = 20;

  // Load attachments
  const attachments = new Map<string, { content: string; url: string }>();
  const jobAttachments = await fetchJobAttachments(job.id);

  for (const att of jobAttachments) {
    try {
      const response = await fetch(att.public_url);
      const content = await response.text();
      attachments.set(att.filename, { content, url: att.public_url });
      await addLog(job.id, `Loaded attachment: ${att.filename}`, "debug");
    } catch (err) {
      await addLog(job.id, `Failed to load attachment: ${att.filename}`, "warn");
    }
  }

  // Build context
  const ctx: ToolContext = {
    jobId: job.id,
    attachments,
    artifacts: new Map(),
    sandbox: null,
  };

  // Build initial messages
  const messages: Array<{ role: string; content?: string; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string }> = [];

  // System message
  let systemContent = `You are a helpful assistant that completes tasks using the available tools.

Available tools:
- fetch_url: Fetch content from URLs (web pages, APIs)
- run_python: Execute Python code for calculations, data processing, file creation
- read_file: Read uploaded attachments
- write_file: Save files as artifacts
- ask_user: Ask the user for clarification
- final_answer: Return the final result (MUST be called to complete the task)

Guidelines:
1. Break complex tasks into steps
2. Use run_python for any calculations or data processing
3. Always call final_answer when done
4. If you need user input, use ask_user`;

  if (attachments.size > 0) {
    systemContent += `\n\nUploaded files available:\n`;
    for (const [name] of attachments) {
      systemContent += `- ${name}\n`;
    }
  }

  messages.push({ role: "system", content: systemContent });

  // User task
  let userMessage = `Task: ${job.task}`;
  if (job.user_answer) {
    userMessage += `\n\nUser's answer to your previous question: ${job.user_answer}`;
  }
  messages.push({ role: "user", content: userMessage });

  await addLog(job.id, `Starting agent loop with ${model}`, "info");

  // Agent loop
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal.aborted) {
      throw new Error("Job was cancelled");
    }

    await addLog(job.id, `Iteration ${iteration + 1}/${MAX_ITERATIONS}`, "debug");

    // Call LLM
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://engine.payo.dev",
        "X-Title": "Engine Platform",
      },
      body: JSON.stringify({
        model,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices[0]?.message;

    if (!assistantMessage) {
      throw new Error("No response from LLM");
    }

    // Add assistant message to history
    messages.push(assistantMessage);

    // Check if there are tool calls
    const toolCalls: ToolCall[] = assistantMessage.tool_calls || [];

    if (toolCalls.length === 0) {
      // No tool calls - check if there's content (shouldn't happen with proper tool use)
      if (assistantMessage.content) {
        await addLog(job.id, `LLM responded without tool call: ${assistantMessage.content.substring(0, 100)}...`, "warn");
        return { success: true, result: assistantMessage.content };
      }
      throw new Error("LLM returned empty response");
    }

    // Execute tool calls
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      let toolArgs: Record<string, any>;

      try {
        toolArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        toolArgs = {};
      }

      await addLog(job.id, `Tool call: ${toolName}(${JSON.stringify(toolArgs).substring(0, 100)}...)`, "info");

      const toolResult = await executeTool(toolName, toolArgs, ctx);

      // Handle special results
      if (toolResult.finalAnswer !== undefined) {
        // Save any artifacts
        await saveArtifacts(ctx);

        // Clean up sandbox
        if (ctx.sandbox) {
          try { await ctx.sandbox.kill(); } catch {}
        }

        return { success: true, result: toolResult.finalAnswer };
      }

      if (toolResult.askUser !== undefined) {
        // Save state and pause for user input
        if (ctx.sandbox) {
          try { await ctx.sandbox.kill(); } catch {}
        }

        return {
          success: true,
          askUser: toolResult.askUser,
          executionState: {
            checkpoint: "waiting_for_input",
            context: {
              variables: {},
              files_created: Array.from(ctx.artifacts.keys()),
              conversation_history: messages,
              packages_installed: [],
            },
            sandbox_id: null,
            resumed_count: 0,
            last_checkpoint_at: new Date().toISOString(),
          },
        };
      }

      // Add tool result to messages
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolName,
        content: toolResult.error || toolResult.result || "OK",
      });
    }
  }

  // Max iterations reached
  if (ctx.sandbox) {
    try { await ctx.sandbox.kill(); } catch {}
  }

  return {
    success: false,
    error: `Agent reached max iterations (${MAX_ITERATIONS}) without completing the task`,
  };
}

// ============================================
// Helper Functions
// ============================================

interface Attachment {
  id: string;
  filename: string;
  mime_type: string | null;
  storage_path: string;
  public_url: string;
  size_bytes: number | null;
}

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

async function saveArtifacts(ctx: ToolContext) {
  for (const [filename, content] of ctx.artifacts) {
    try {
      const storagePath = `artifacts/${ctx.jobId}/${filename}`;

      const { error: uploadError } = await supabase.storage
        .from("job-files")
        .upload(storagePath, content, { upsert: true });

      if (uploadError) continue;

      const { data: urlData } = supabase.storage
        .from("job-files")
        .getPublicUrl(storagePath);

      await supabase.from("job_artifacts").insert({
        job_id: ctx.jobId,
        filename,
        storage_path: storagePath,
        public_url: urlData.publicUrl,
        size_bytes: content.length,
      });

      await addLog(ctx.jobId, `Saved artifact: ${filename}`, "info");
    } catch (err) {
      await addLog(ctx.jobId, `Failed to save artifact: ${filename}`, "warn");
    }
  }
}

// ============================================
// Job Execution
// ============================================

async function executeJob(job: Job) {
  const controller = new AbortController();
  activeJobs.set(job.id, controller);

  console.log(`Executing job ${job.id}: ${job.task.substring(0, 50)}...`);

  try {
    await addLog(job.id, `Worker ${config.workerId} started job`, "info");

    const result = await runAgentLoop(job, controller.signal);

    if (result.askUser) {
      // Job is paused for user input
      await pauseForUserInput(job.id, result.askUser, result.executionState!);
      console.log(`Job ${job.id} paused for user input`);
    } else if (result.success) {
      // Job completed
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
      await releaseJob(job.id);
      console.log(`Job ${job.id} released (worker shutdown)`);
    } else {
      await failJob(job.id, message);
      console.error(`Job ${job.id} error:`, error);
    }
  } finally {
    activeJobs.delete(job.id);
    await updateHeartbeat();
  }
}

// ============================================
// Job Queue Management
// ============================================

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

async function addLog(jobId: string, message: string, level: string) {
  await supabase.from("job_logs").insert({
    job_id: jobId,
    message,
    level,
  });
}

// ============================================
// Worker Lifecycle
// ============================================

async function main() {
  console.log(`Worker starting: ${config.workerId}`);
  console.log(`Concurrency: ${config.concurrency}`);
  console.log(`Poll interval: ${config.pollInterval}ms`);

  running = true;

  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);

  startHeartbeat();
  startStaleJobRecovery();

  await pollLoop();
}

async function pollLoop() {
  while (running && !shuttingDown) {
    try {
      if (activeJobs.size < config.concurrency) {
        const job = await claimNextJob();
        if (job) {
          executeJob(job);
        }
      }
    } catch (error) {
      console.error("Poll error:", error);
    }

    await sleep(config.pollInterval);
  }
}

async function updateHeartbeat() {
  await supabase.from("workers").upsert({
    id: config.workerId,
    last_heartbeat: new Date().toISOString(),
    active_jobs: activeJobs.size,
    status: shuttingDown ? "draining" : "active",
    hostname: hostname(),
    version: "2.0.0",
  });
}

function startHeartbeat() {
  updateHeartbeat();
  setInterval(updateHeartbeat, config.heartbeatInterval);
}

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
  }, 2 * 60 * 1000);
}

async function gracefulShutdown() {
  if (shuttingDown) return;

  console.log("Graceful shutdown initiated...");
  shuttingDown = true;
  running = false;

  await updateHeartbeat();

  const deadline = Date.now() + config.shutdownTimeout;

  while (activeJobs.size > 0 && Date.now() < deadline) {
    console.log(`Waiting for ${activeJobs.size} jobs to complete...`);
    await sleep(1000);
  }

  if (activeJobs.size > 0) {
    console.log(`Aborting ${activeJobs.size} remaining jobs...`);
    activeJobs.forEach((controller) => {
      controller.abort();
    });
    await sleep(1000);
  }

  await supabase
    .from("workers")
    .update({ status: "dead" })
    .eq("id", config.workerId);

  console.log("Worker shutdown complete");
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Start worker
main().catch((error) => {
  console.error("Worker fatal error:", error);
  process.exit(1);
});
