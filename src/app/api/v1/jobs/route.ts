import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest, errorResponse, successResponse } from "@/lib/api/auth";
import { enqueueJob, listJobs } from "@/lib/queue";
import { discoverAgents } from "@/lib/discovery";
import { setDiscoveredTools, addJobLog } from "@/lib/queue";
import { getSupabaseAdmin } from "@/lib/db";

// Available models for OpenRouter
const AVAILABLE_MODELS = [
  "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-sonnet",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "google/gemini-2.0-flash-001",
  "deepseek/deepseek-chat",
  "meta-llama/llama-3.3-70b-instruct",
];

// Request validation schema
const createJobSchema = z.object({
  task: z.string().min(1).max(10000),
  priority: z.number().int().min(0).max(100).optional().default(0),
  timeout_seconds: z.number().int().min(30).max(3600).optional().default(300),
  model: z.string().optional().default("anthropic/claude-sonnet-4"),
  attachments: z.array(z.object({
    filename: z.string(),
    storage_path: z.string(),
    public_url: z.string(),
    mime_type: z.string().optional(),
    size_bytes: z.number().optional(),
  })).optional(),
});

/**
 * POST /api/v1/jobs - Create a new job
 */
export async function POST(request: NextRequest) {
  // Authenticate
  const auth = await authenticateRequest(request, ["jobs:write"]);
  if (!auth.success) return auth.response;

  try {
    // Parse and validate body
    const body = await request.json();
    const parsed = createJobSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(
        `Invalid request: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
        400,
        "VALIDATION_ERROR"
      );
    }

    const { task, priority, timeout_seconds, model, attachments } = parsed.data;

    // Create the job
    const job = await enqueueJob({
      task,
      apiKeyId: auth.context.keyId,
      priority,
      timeoutSeconds: timeout_seconds,
      model,
    });

    await addJobLog(job.id, `Job created: ${task.substring(0, 100)}...`, "info");

    // Save attachments if provided
    if (attachments && attachments.length > 0) {
      const supabase = getSupabaseAdmin();
      for (const attachment of attachments) {
        await supabase.from("job_attachments").insert({
          job_id: job.id,
          filename: attachment.filename,
          mime_type: attachment.mime_type || null,
          storage_path: attachment.storage_path,
          public_url: attachment.public_url,
          size_bytes: attachment.size_bytes || null,
        });
      }
      await addJobLog(job.id, `Attached ${attachments.length} file(s): ${attachments.map(a => a.filename).join(", ")}`, "info");
    }

    // Discover relevant agents/tools (async, don't block response)
    discoverAgents({ task })
      .then(async (agents) => {
        if (agents.length > 0) {
          const tools = agents.map((a) => a.package_name);
          await setDiscoveredTools(job.id, tools);
          await addJobLog(
            job.id,
            `Discovered tools: ${tools.join(", ")}`,
            "info"
          );
        }
      })
      .catch((err) => {
        console.warn("Agent discovery failed:", err);
      });

    return successResponse(
      {
        id: job.id,
        status: job.status,
        task: job.task,
        created_at: job.created_at,
      },
      201
    );
  } catch (error) {
    console.error("Failed to create job:", error);
    return errorResponse("Failed to create job", 500, "INTERNAL_ERROR");
  }
}

/**
 * GET /api/v1/jobs - List jobs
 */
export async function GET(request: NextRequest) {
  // Authenticate
  const auth = await authenticateRequest(request, ["jobs:read"]);
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as string | undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // List jobs for this API key only
    const jobs = await listJobs({
      apiKeyId: auth.context.keyId,
      status: status as any,
      limit: Math.min(limit, 100),
      offset,
    });

    return successResponse({
      jobs: jobs.map((job) => ({
        id: job.id,
        task: job.task,
        status: job.status,
        priority: job.priority,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        agent_question: job.agent_question,
      })),
      count: jobs.length,
      offset,
      limit,
    });
  } catch (error) {
    console.error("Failed to list jobs:", error);
    return errorResponse("Failed to list jobs", 500, "INTERNAL_ERROR");
  }
}
