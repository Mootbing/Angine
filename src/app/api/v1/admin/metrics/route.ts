import { NextRequest } from "next/server";
import { authenticateRequest, errorResponse, successResponse } from "@/lib/api/auth";
import { getSupabaseAdmin } from "@/lib/db";

/**
 * GET /api/v1/admin/metrics - Get system metrics
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, ["admin"]);
  if (!auth.success) return auth.response;

  try {
    const supabase = getSupabaseAdmin();

    // Get job counts by status
    const { data: jobCounts, error: jobError } = await supabase
      .from("job_queue")
      .select("status")
      .then(({ data }) => {
        const counts: Record<string, number> = {
          queued: 0,
          running: 0,
          completed: 0,
          failed: 0,
          waiting_for_user: 0,
          cancelled: 0,
        };

        data?.forEach((job) => {
          counts[job.status] = (counts[job.status] || 0) + 1;
        });

        return { data: counts, error: null };
      });

    // Get worker counts
    const { data: workers } = await supabase.from("workers").select("status");

    const workerCounts = {
      active: 0,
      draining: 0,
      dead: 0,
    };

    workers?.forEach((w) => {
      workerCounts[w.status as keyof typeof workerCounts]++;
    });

    // Get agent counts
    const { count: totalAgents } = await supabase
      .from("agents")
      .select("id", { count: "exact", head: true });

    const { count: verifiedAgents } = await supabase
      .from("agents")
      .select("id", { count: "exact", head: true })
      .eq("verified", true);

    // Get API key counts
    const { count: totalKeys } = await supabase
      .from("api_keys")
      .select("id", { count: "exact", head: true });

    const { count: activeKeys } = await supabase
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    // Get recent job throughput (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count: jobsLastHour } = await supabase
      .from("job_queue")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneHourAgo);

    const { count: completedLastHour } = await supabase
      .from("job_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("completed_at", oneHourAgo);

    return successResponse({
      jobs: {
        by_status: jobCounts,
        total: Object.values(jobCounts || {}).reduce((a, b) => a + b, 0),
        last_hour: {
          created: jobsLastHour || 0,
          completed: completedLastHour || 0,
        },
      },
      workers: {
        by_status: workerCounts,
        total: Object.values(workerCounts).reduce((a, b) => a + b, 0),
      },
      agents: {
        total: totalAgents || 0,
        verified: verifiedAgents || 0,
      },
      api_keys: {
        total: totalKeys || 0,
        active: activeKeys || 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to get metrics:", error);
    return errorResponse("Failed to get metrics", 500, "INTERNAL_ERROR");
  }
}
