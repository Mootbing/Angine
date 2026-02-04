import { NextRequest } from "next/server";
import { authenticateRequest, errorResponse, successResponse } from "@/lib/api/auth";
import { getJob } from "@/lib/queue";
import { getJobArtifacts } from "@/lib/sandbox";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/jobs/[id]/artifacts - Get job artifacts
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest(request, ["jobs:read"]);
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;

    // Verify job exists and belongs to user
    const job = await getJob(id);

    if (!job) {
      return errorResponse("Job not found", 404, "NOT_FOUND");
    }

    if (job.api_key_id !== auth.context.keyId && !auth.context.scopes.includes("admin")) {
      return errorResponse("Job not found", 404, "NOT_FOUND");
    }

    // Get artifacts
    const artifacts = await getJobArtifacts(id);

    return successResponse({
      artifacts: artifacts.map((a) => ({
        id: a.id,
        filename: a.filename,
        mime_type: a.mime_type,
        url: a.public_url,
        size_bytes: a.size_bytes,
        created_at: a.created_at,
      })),
      count: artifacts.length,
    });
  } catch (error) {
    console.error("Failed to get job artifacts:", error);
    return errorResponse("Failed to get job artifacts", 500, "INTERNAL_ERROR");
  }
}
