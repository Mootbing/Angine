import { NextRequest } from "next/server";
import { authenticateRequest, errorResponse, successResponse } from "@/lib/api/auth";
import { getJob, getJobLogs } from "@/lib/queue";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/jobs/[id]/logs - Get job logs
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest(request, ["jobs:read"]);
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Verify job exists and belongs to user
    const job = await getJob(id);

    if (!job) {
      return errorResponse("Job not found", 404, "NOT_FOUND");
    }

    if (job.api_key_id !== auth.context.keyId && !auth.context.scopes.includes("admin")) {
      return errorResponse("Job not found", 404, "NOT_FOUND");
    }

    // Get logs
    const logs = await getJobLogs(id, {
      limit: Math.min(limit, 1000),
      offset,
    });

    return successResponse({
      logs: logs.map((log) => ({
        id: log.id,
        level: log.level,
        message: log.message,
        timestamp: log.timestamp,
        metadata: log.metadata,
      })),
      count: logs.length,
      offset,
      limit,
    });
  } catch (error) {
    console.error("Failed to get job logs:", error);
    return errorResponse("Failed to get job logs", 500, "INTERNAL_ERROR");
  }
}
