import { NextRequest } from "next/server";
import { authenticateRequest, errorResponse, successResponse } from "@/lib/api/auth";
import { getSupabaseAdmin } from "@/lib/db";
import { generateEmbedding } from "@/lib/discovery";

/**
 * POST /api/v1/admin/agents/reindex - Regenerate embeddings for all agents
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, ["admin"]);
  if (!auth.success) return auth.response;

  try {
    const supabase = getSupabaseAdmin();

    // Get all agents
    const { data: agents, error: fetchError } = await supabase
      .from("agents")
      .select("id, name, description");

    if (fetchError) {
      throw new Error(`Failed to fetch agents: ${fetchError.message}`);
    }

    if (!agents || agents.length === 0) {
      return successResponse({ message: "No agents to reindex", count: 0 });
    }

    // Generate embeddings for each agent
    let updated = 0;
    const errors: string[] = [];

    for (const agent of agents) {
      try {
        const embedding = await generateEmbedding(agent.description);

        const { error: updateError } = await supabase
          .from("agents")
          .update({ embedding })
          .eq("id", agent.id);

        if (updateError) {
          errors.push(`${agent.name}: ${updateError.message}`);
        } else {
          updated++;
        }
      } catch (err) {
        errors.push(`${agent.name}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return successResponse({
      message: `Reindexed ${updated}/${agents.length} agents`,
      updated,
      total: agents.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Failed to reindex agents:", error);
    return errorResponse("Failed to reindex agents", 500, "INTERNAL_ERROR");
  }
}
