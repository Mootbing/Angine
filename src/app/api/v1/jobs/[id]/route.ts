import { NextRequest } from "next/server";
import { authenticateRequest, errorResponse, successResponse } from "@/lib/api/auth";
import { getJob, cancelJob } from "@/lib/queue";
import { getJobArtifacts } from "@/lib/sandbox";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/jobs/[id] - Get job details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest(request, ["jobs:read"]);
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const job = await getJob(id);

    if (!job) {
      return errorResponse("Job not found", 404, "NOT_FOUND");
    }

    // Verify ownership
    if (job.api_key_id !== auth.context.keyId && !auth.context.scopes.includes("admin")) {
      return errorResponse("Job not found", 404, "NOT_FOUND");
    }

    // Get artifacts
    const artifacts = await getJobArtifacts(id);

    return successResponse({
      id: job.id,
      task: job.task,
      status: job.status,
      priority: job.priority,
      timeout_seconds: job.timeout_seconds,
      tools_discovered: job.tools_discovered,
      result: job.result,
      error_message: job.error_message,
      agent_question: job.agent_question,
      retry_count: job.retry_count,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      paused_at: job.paused_at,
      artifacts: artifacts.map((a) => ({
        id: a.id,
        filename: a.filename,
        mime_type: a.mime_type,
        url: a.public_url,
        size_bytes: a.size_bytes,
      })),
    });
  } catch (error) {
    console.error("Failed to get job:", error);
    return errorResponse("Failed to get job", 500, "INTERNAL_ERROR");
  }
}

/**
 * DELETE /api/v1/jobs/[id] - Cancel a job
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest(request, ["jobs:delete"]);
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const job = await getJob(id);

    if (!job) {
      return errorResponse("Job not found", 404, "NOT_FOUND");
    }

    // Verify ownership
    if (job.api_key_id !== auth.context.keyId && !auth.context.scopes.includes("admin")) {
      return errorResponse("Job not found", 404, "NOT_FOUND");
    }

    // Check if job can be cancelled
    if (job.status === "running") {
      return errorResponse(
        "Cannot cancel a running job. Wait for it to complete or timeout.",
        400,
        "INVALID_STATE"
      );
    }

    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      return errorResponse(
        `Job is already ${job.status}`,
        400,
        "INVALID_STATE"
      );
    }

    await cancelJob(id);

    return successResponse({ id, status: "cancelled" });
  } catch (error) {
    console.error("Failed to cancel job:", error);
    return errorResponse("Failed to cancel job", 500, "INTERNAL_ERROR");
  }
}
