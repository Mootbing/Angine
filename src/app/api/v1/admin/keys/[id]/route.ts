import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest, errorResponse, successResponse } from "@/lib/api/auth";
import { revokeApiKey } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const revokeSchema = z.object({
  reason: z.string().max(500).optional(),
});

/**
 * GET /api/v1/admin/keys/[id] - Get API key details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest(request, ["admin"]);
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: key, error } = await supabase
      .from("api_keys")
      .select("id, key_prefix, name, owner_email, scopes, rate_limit_rpm, is_active, revoked_at, revoked_reason, created_at, last_used_at, total_requests, metadata")
      .eq("id", id)
      .single();

    if (error || !key) {
      return errorResponse("API key not found", 404, "NOT_FOUND");
    }

    return successResponse(key);
  } catch (error) {
    console.error("Failed to get API key:", error);
    return errorResponse("Failed to get API key", 500, "INTERNAL_ERROR");
  }
}

/**
 * DELETE /api/v1/admin/keys/[id] - Revoke an API key
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest(request, ["admin"]);
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;

    // Parse optional reason from body
    let reason: string | undefined;
    try {
      const body = await request.json();
      const parsed = revokeSchema.safeParse(body);
      if (parsed.success) {
        reason = parsed.data.reason;
      }
    } catch {
      // No body is fine
    }

    await revokeApiKey(id, reason);

    return successResponse({
      id,
      status: "revoked",
      message: "API key has been revoked and can no longer be used.",
    });
  } catch (error) {
    console.error("Failed to revoke API key:", error);
    return errorResponse("Failed to revoke API key", 500, "INTERNAL_ERROR");
  }
}
