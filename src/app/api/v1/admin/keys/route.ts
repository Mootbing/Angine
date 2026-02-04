import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest, errorResponse, successResponse } from "@/lib/api/auth";
import { generateApiKey, listApiKeys } from "@/lib/auth";

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  owner_email: z.string().email().optional(),
  scopes: z.array(z.enum([
    "jobs:read",
    "jobs:write",
    "jobs:delete",
    "agents:read",
    "agents:write",
    "admin",
  ])).optional(),
  rate_limit_rpm: z.number().int().min(1).max(10000).optional(),
});

/**
 * GET /api/v1/admin/keys - List API keys
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, ["admin"]);
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const activeOnly = searchParams.get("active_only") !== "false";

    const keys = await listApiKeys({
      limit: Math.min(limit, 100),
      offset,
      activeOnly,
    });

    return successResponse({
      keys: keys.map((k) => ({
        id: k.id,
        key_prefix: k.key_prefix,
        name: k.name,
        owner_email: k.owner_email,
        scopes: k.scopes,
        rate_limit_rpm: k.rate_limit_rpm,
        is_active: k.is_active,
        created_at: k.created_at,
        last_used_at: k.last_used_at,
        total_requests: k.total_requests,
      })),
      count: keys.length,
      offset,
      limit,
    });
  } catch (error) {
    console.error("Failed to list API keys:", error);
    return errorResponse("Failed to list API keys", 500, "INTERNAL_ERROR");
  }
}

/**
 * POST /api/v1/admin/keys - Create a new API key
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, ["admin"]);
  if (!auth.success) return auth.response;

  try {
    const body = await request.json();
    const parsed = createKeySchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(
        `Invalid request: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
        400,
        "VALIDATION_ERROR"
      );
    }

    const { key, keyId } = await generateApiKey({
      name: parsed.data.name,
      ownerEmail: parsed.data.owner_email,
      scopes: parsed.data.scopes as any,
      rateLimitRpm: parsed.data.rate_limit_rpm,
    });

    return successResponse(
      {
        id: keyId,
        key, // Only returned once!
        message: "API key created. Store this key securely - it cannot be retrieved again.",
      },
      201
    );
  } catch (error) {
    console.error("Failed to create API key:", error);
    return errorResponse("Failed to create API key", 500, "INTERNAL_ERROR");
  }
}
