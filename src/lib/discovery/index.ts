import OpenAI from "openai";
import { getSupabaseAdmin } from "@/lib/db";
import type { Agent } from "@/types";

// Lazy initialization of OpenAI client
let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (openai) return openai;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }

  openai = new OpenAI({ apiKey });
  return openai;
}

/**
 * Generate embedding for a text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAI();

  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    dimensions: 1536,
  });

  return response.data[0].embedding;
}

/**
 * Discover agents that match a task description
 */
export async function discoverAgents(params: {
  task: string;
  threshold?: number;
  limit?: number;
}): Promise<Array<{ id: string; name: string; package_name: string; similarity: number }>> {
  const { task, threshold = 0.7, limit = 5 } = params;
  const supabase = getSupabaseAdmin();

  // Generate embedding for the task
  const embedding = await generateEmbedding(task);

  // Query matching agents using vector similarity
  const { data, error } = await supabase.rpc("match_agents", {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    throw new Error(`Failed to discover agents: ${error.message}`);
  }

  return data || [];
}

/**
 * Register a new agent
 */
export async function registerAgent(params: {
  name: string;
  description: string;
  packageName: string;
  version?: string;
}): Promise<Agent> {
  const supabase = getSupabaseAdmin();

  // Generate embedding for the description
  const embedding = await generateEmbedding(params.description);

  const { data, error } = await supabase
    .from("agents")
    .insert({
      name: params.name,
      description: params.description,
      package_name: params.packageName,
      version: params.version || "1.0.0",
      embedding,
      verified: false,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to register agent: ${error.message}`);
  }

  return data as Agent;
}

/**
 * Verify an agent (admin operation)
 */
export async function verifyAgent(agentId: string, verifiedBy: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("agents")
    .update({
      verified: true,
      verified_at: new Date().toISOString(),
      verified_by: verifiedBy,
    })
    .eq("id", agentId);

  if (error) {
    throw new Error(`Failed to verify agent: ${error.message}`);
  }
}

/**
 * List all verified agents
 */
export async function listAgents(params?: {
  verifiedOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<Agent[]> {
  const supabase = getSupabaseAdmin();
  const { verifiedOnly = true, limit = 50, offset = 0 } = params || {};

  let query = supabase
    .from("agents")
    .select("id, name, description, package_name, version, verified, created_at, updated_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (verifiedOnly) {
    query = query.eq("verified", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list agents: ${error.message}`);
  }

  return data as Agent[];
}

/**
 * Update agent embedding (e.g., when description changes)
 */
export async function updateAgentEmbedding(agentId: string, description: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const embedding = await generateEmbedding(description);

  const { error } = await supabase
    .from("agents")
    .update({
      description,
      embedding,
      updated_at: new Date().toISOString(),
    })
    .eq("id", agentId);

  if (error) {
    throw new Error(`Failed to update agent embedding: ${error.message}`);
  }
}
