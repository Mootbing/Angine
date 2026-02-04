import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest, errorResponse, successResponse } from "@/lib/api/auth";
import { discoverAgents } from "@/lib/discovery";

const discoverSchema = z.object({
  task: z.string().min(1).max(10000),
  threshold: z.number().min(0).max(1).optional().default(0.7),
  limit: z.number().int().min(1).max(20).optional().default(5),
});

/**
 * POST /api/v1/agents/discover - Discover agents for a task
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, ["agents:read"]);
  if (!auth.success) return auth.response;

  try {
    const body = await request.json();
    const parsed = discoverSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(
        `Invalid request: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
        400,
        "VALIDATION_ERROR"
      );
    }

    const agents = await discoverAgents({
      task: parsed.data.task,
      threshold: parsed.data.threshold,
      limit: parsed.data.limit,
    });

    return successResponse({
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        package_name: a.package_name,
        similarity: Math.round(a.similarity * 1000) / 1000, // Round to 3 decimal places
      })),
      count: agents.length,
      threshold: parsed.data.threshold,
    });
  } catch (error) {
    console.error("Failed to discover agents:", error);
    return errorResponse("Failed to discover agents", 500, "INTERNAL_ERROR");
  }
}
