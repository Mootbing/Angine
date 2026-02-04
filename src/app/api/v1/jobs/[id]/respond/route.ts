import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest, errorResponse, successResponse } from "@/lib/api/auth";
import { getJob, respondToJob } from "@/lib/queue";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const respondSchema = z.object({
  answer: z.string().min(1).max(10000),
});

/**
 * POST /api/v1/jobs/[id]/respond - Respond to HITL question
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest(request, ["jobs:write"]);
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;

    // Parse body
    const body = await request.json();
    const parsed = respondSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(
        `Invalid request: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
        400,
        "VALIDATION_ERROR"
      );
    }

    // Verify job exists and belongs to user
    const job = await getJob(id);

    if (!job) {
      return errorResponse("Job not found", 404, "NOT_FOUND");
    }

    if (job.api_key_id !== auth.context.keyId && !auth.context.scopes.includes("admin")) {
      return errorResponse("Job not found", 404, "NOT_FOUND");
    }

    // Check job is waiting for user
    if (job.status !== "waiting_for_user") {
      return errorResponse(
        `Job is not waiting for user input (status: ${job.status})`,
        400,
        "INVALID_STATE"
      );
    }

    // Respond to the job
    await respondToJob(id, parsed.data.answer);

    return successResponse({
      id,
      status: "queued",
      message: "Response received. Job has been re-queued for processing.",
    });
  } catch (error) {
    console.error("Failed to respond to job:", error);
    return errorResponse("Failed to respond to job", 500, "INTERNAL_ERROR");
  }
}
