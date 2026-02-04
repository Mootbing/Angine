import { NextRequest } from "next/server";
import { authenticateRequest, errorResponse, successResponse } from "@/lib/api/auth";
import { getSupabaseAdmin } from "@/lib/db";

/**
 * GET /api/v1/admin/workers - List workers
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, ["admin"]);
  if (!auth.success) return auth.response;

  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("workers")
      .select()
      .order("last_heartbeat", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: workers, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate health status based on heartbeat
    const now = Date.now();
    const workersWithHealth = (workers || []).map((w) => {
      const lastHeartbeat = new Date(w.last_heartbeat).getTime();
      const secondsSinceHeartbeat = (now - lastHeartbeat) / 1000;

      let health: "healthy" | "warning" | "dead";
      if (secondsSinceHeartbeat < 60) {
        health = "healthy";
      } else if (secondsSinceHeartbeat < 120) {
        health = "warning";
      } else {
        health = "dead";
      }

      return {
        ...w,
        health,
        seconds_since_heartbeat: Math.round(secondsSinceHeartbeat),
      };
    });

    return successResponse({
      workers: workersWithHealth,
      count: workersWithHealth.length,
      summary: {
        healthy: workersWithHealth.filter((w) => w.health === "healthy").length,
        warning: workersWithHealth.filter((w) => w.health === "warning").length,
        dead: workersWithHealth.filter((w) => w.health === "dead").length,
      },
    });
  } catch (error) {
    console.error("Failed to list workers:", error);
    return errorResponse("Failed to list workers", 500, "INTERNAL_ERROR");
  }
}
