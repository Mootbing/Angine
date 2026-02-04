import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest, errorResponse, successResponse } from "@/lib/api/auth";
import { listAgents, registerAgent } from "@/lib/discovery";

const registerAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(10).max(5000),
  package_name: z.string().min(1).max(200).regex(/^[a-z0-9_-]+$/i, "Package name must be alphanumeric with dashes/underscores"),
  version: z.string().optional().default("1.0.0"),
});

/**
 * GET /api/v1/agents - List agents
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, ["agents:read"]);
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const verifiedOnly = searchParams.get("verified_only") !== "false";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const agents = await listAgents({
      verifiedOnly,
      limit: Math.min(limit, 100),
      offset,
    });

    return successResponse({
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        package_name: a.package_name,
        version: a.version,
        verified: a.verified,
        created_at: a.created_at,
      })),
      count: agents.length,
      offset,
      limit,
    });
  } catch (error) {
    console.error("Failed to list agents:", error);
    return errorResponse("Failed to list agents", 500, "INTERNAL_ERROR");
  }
}

/**
 * POST /api/v1/agents - Register a new agent
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, ["agents:write"]);
  if (!auth.success) return auth.response;

  try {
    const body = await request.json();
    const parsed = registerAgentSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(
        `Invalid request: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
        400,
        "VALIDATION_ERROR"
      );
    }

    const agent = await registerAgent({
      name: parsed.data.name,
      description: parsed.data.description,
      packageName: parsed.data.package_name,
      version: parsed.data.version,
    });

    return successResponse(
      {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        package_name: agent.package_name,
        version: agent.version,
        verified: agent.verified,
        created_at: agent.created_at,
        message: "Agent registered. Awaiting verification before it can be discovered.",
      },
      201
    );
  } catch (error: any) {
    if (error.message?.includes("duplicate key")) {
      return errorResponse(
        "An agent with this package name already exists",
        409,
        "DUPLICATE"
      );
    }
    console.error("Failed to register agent:", error);
    return errorResponse("Failed to register agent", 500, "INTERNAL_ERROR");
  }
}
