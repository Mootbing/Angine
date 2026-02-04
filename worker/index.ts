import { hostname } from "os";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Job, ExecutionState, WorkerConfig } from "../src/types";

// Load environment variables from .env.local
loadEnv({ path: ".env.local" });

// Environment validation
const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENROUTER_API_KEY",
  "E2B_API_KEY",
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
      name: "discover_tools",
      description: "Search for additional specialized tools (MCP servers) that might help with the task. Use this when you need capabilities beyond the basic built-in tools (e.g., browser automation, GitHub integration, etc.).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Description of what kind of tool you're looking for (e.g., 'browser automation', 'file management', 'GitHub operations')" },
        },
        required: ["query"],
      },
    },
  },
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
      case "discover_tools": {
        const { query } = args;
        await addLog(ctx.jobId, `Discovering tools for: ${query}`, "info");

        try {
          // Determine API base URL
          const isLocal = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('127.0.0.1') || process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('localhost');
          const apiBaseUrl = process.env.ENGINE_API_URL || (isLocal ? 'http://localhost:3000' : 'https://engine.payo.dev');
          const apiKey = process.env.WORKER_API_KEY || process.env.ENGINE_API_KEY || 'engine_test_local_dev_key_12345';

          // Call the discovery API
          const response = await fetch(`${apiBaseUrl}/api/v1/agents/discover`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ task: query, threshold: 0.3, limit: 5 }),
          });

          if (!response.ok) {
            // Fallback: query database directly
            const { data: agents } = await supabase
              .from("agents")
              .select("name, description, mcp_package, mcp_tools")
              .eq("verified", true);

            if (agents && agents.length > 0) {
              const toolList = agents.map((a: any) => {
                const tools = a.mcp_tools || [];
                return `**${a.name}** (${a.mcp_package})\n${a.description}\nTools: ${tools.map((t: any) => t.name).join(", ")}`;
              }).join("\n\n");

              return { result: `Available MCP servers:\n\n${toolList}\n\nNote: These are external MCP servers. Currently, only built-in tools (fetch_url, run_python, read_file, write_file, ask_user, final_answer) are directly executable. Use the built-in tools to accomplish your task.` };
            }
          }

          const data = await response.json();
          const agents = data.agents || [];

          if (agents.length === 0) {
            return { result: "No specialized tools found for this query. Use the built-in tools (fetch_url, run_python, read_file, write_file) to accomplish the task." };
          }

          // Get full agent details
          const { data: fullAgents } = await supabase
            .from("agents")
            .select("name, description, mcp_package, mcp_tools")
            .in("id", agents.map((a: any) => a.id));

          const toolList = (fullAgents || []).map((a: any) => {
            const tools = a.mcp_tools || [];
            const similarity = agents.find((x: any) => x.name === a.name)?.similarity || 0;
            return `**${a.name}** (${Math.round(similarity * 100)}% match)\n${a.description}\nPackage: ${a.mcp_package}\nAvailable tools: ${tools.map((t: any) => `${t.name} - ${t.description}`).join("; ")}`;
          }).join("\n\n");

          return { result: `Discovered tools relevant to "${query}":\n\n${toolList}\n\nNote: These are MCP servers that could help with this task. Currently, only built-in tools are directly executable. Use fetch_url, run_python, read_file, and write_file to accomplish similar functionality.` };
        } catch (err) {
          return { result: "Tool discovery unavailable. Use built-in tools: fetch_url (web requests), run_python (code execution), read_file, write_file." };
        }
      }

      case "fetch_url": {
        const { url, method = "GET", headers = {}, body } = args;
        await addLog(ctx.jobId, `Fetching ${method} ${url}`, "info");

        const fetchController = new AbortController();
        const timeout = setTimeout(() => fetchController.abort(), 30000); // 30s timeout

        const response = await fetch(url, {
          method,
          headers: headers as Record<string, string>,
          body: body ? body : undefined,
          signal: fetchController.signal,
        }).finally(() => clearTimeout(timeout));

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

        // Install additional packages if requested (sanitize names to prevent injection)
        if (packages.length > 0) {
          const safePackages = packages
            .filter((p: string) => /^[a-zA-Z0-9_\-\[\]<>=.,]+$/.test(p))
            .slice(0, 10); // Limit to 10 packages
          if (safePackages.length > 0) {
            await ctx.sandbox.commands.run(
              `pip install ${safePackages.join(" ")} -q`,
              { timeoutMs: 60000 }
            );
          }
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

  const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB limit

  for (const att of jobAttachments) {
    try {
      // Skip files that are too large
      if (att.size_bytes && att.size_bytes > MAX_ATTACHMENT_SIZE) {
        await addLog(job.id, `Skipping large attachment: ${att.filename} (${Math.round(att.size_bytes / 1024 / 1024)}MB)`, "warn");
        continue;
      }

      const response = await fetch(att.public_url);
      const content = await response.text();

      // Double-check size after download
      if (content.length > MAX_ATTACHMENT_SIZE) {
        await addLog(job.id, `Attachment too large after download: ${att.filename}`, "warn");
        continue;
      }

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
  let systemContent = `You are an intelligent agent that completes tasks using available tools. You have access to a tool marketplace with many specialized capabilities.

## IMPORTANT: You MUST follow this workflow

1. **ANALYZE** - Understand what the task requires
2. **DISCOVER** - Use discover_tools to find relevant specialized tools
3. **PLAN** - Create a high-level plan based on available tools
4. **ASK FOR APPROVAL** - Use ask_user to present your plan and wait for user approval BEFORE executing anything
5. **EXECUTE** - Only after approval, execute your plan step by step
6. **COMPLETE** - Call final_answer with the result

## Your First Response MUST:
1. Call discover_tools to see what specialized tools are available
2. Then call ask_user with a brief summary of:
   - What tools you found that could help
   - Your proposed approach/plan (3-5 bullet points)
   - Ask: "Should I proceed with this plan?"

DO NOT execute any actions (fetch_url, run_python, write_file) until the user approves your plan!

## Built-in Tools

- **discover_tools**: Search for specialized MCP tools (browser automation, GitHub, etc.) - USE THIS FIRST
- **fetch_url**: Fetch content from URLs (web pages, APIs)
- **run_python**: Execute Python code for calculations, data processing
- **read_file**: Read uploaded file attachments
- **write_file**: Save files as job artifacts
- **ask_user**: Pause and ask user a question - USE THIS TO GET PLAN APPROVAL
- **final_answer**: Return the final result (REQUIRED to complete)

## Guidelines

- ALWAYS discover tools and ask for approval before executing
- Keep your plan summary concise (high-level steps only)
- After approval, execute efficiently
- Call final_answer when done`;

  if (attachments.size > 0) {
    systemContent += `\n\nUploaded files available:\n`;
    for (const [name] of attachments) {
      systemContent += `- ${name}\n`;
    }
  }

  // Check if we're resuming from a previous state
  const executionState = job.execution_state as ExecutionState | null;
  if (executionState?.context?.conversation_history && job.user_answer) {
    // Restore conversation history from previous execution
    const history = executionState.context.conversation_history as Array<any>;
    messages.push(...history);

    // Add user's answer as a new message
    messages.push({
      role: "user",
      content: `User's answer: ${job.user_answer}`,
    });

    await addLog(job.id, `Resuming job with ${history.length} previous messages`, "info");
  } else {
    // Fresh start
    messages.push({ role: "system", content: systemContent });

    // User task
    const userMessage = `Task: ${job.task}`;
    messages.push({ role: "user", content: userMessage });
  }

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
      let parseError = false;

      try {
        toolArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        toolArgs = {};
        parseError = true;
      }

      await addLog(job.id, `Tool call: ${toolName}(${JSON.stringify(toolArgs).substring(0, 100)}...)`, "info");

      let toolResult;
      if (parseError) {
        toolResult = { error: `Failed to parse tool arguments: ${toolCall.function.arguments.substring(0, 200)}` };
      } else {
        toolResult = await executeTool(toolName, toolArgs, ctx);
      }

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
        // Save artifacts before pausing
        await saveArtifacts(ctx);

        // Clean up sandbox
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
