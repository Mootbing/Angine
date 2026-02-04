import { createHash, randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/db";
import type { ApiKeyValidation, ApiScope } from "@/types";

const KEY_PREFIX = "engine";

/**
 * Generate a new API key
 * Returns the raw key (shown once) and the database record ID
 */
export async function generateApiKey(params: {
  name: string;
  ownerEmail?: string;
  scopes?: ApiScope[];
  rateLimitRpm?: number;
}): Promise<{ key: string; keyId: string }> {
  const supabase = getSupabaseAdmin();

  // Determine environment
  const environment = process.env.NODE_ENV === "production" ? "live" : "test";

  // Generate cryptographically secure random key (32 chars base64url)
  const randomPart = randomBytes(24).toString("base64url");
  const key = `${KEY_PREFIX}_${environment}_${randomPart}`;

  // Hash for storage (never store raw key)
  const keyHash = createHash("sha256").update(key).digest("hex");

  // Prefix for display (allows identifying key without exposing it)
  const keyPrefix = key.substring(0, 14) + "...";

  // Store in database
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      key_prefix: keyPrefix,
      key_hash: keyHash,
      name: params.name,
      owner_email: params.ownerEmail || null,
      scopes: params.scopes || ["jobs:write", "jobs:read"],
      rate_limit_rpm: params.rateLimitRpm || 60,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create API key: ${error.message}`);
  }

  // Return key ONCE - it cannot be retrieved again
  return { key, keyId: data.id };
}

/**
 * Validate an API key and return its metadata
 */
export async function validateApiKey(key: string): Promise<ApiKeyValidation> {
  // Quick format validation
  if (!key.startsWith(`${KEY_PREFIX}_`)) {
    return { valid: false, error: "Invalid API key format" };
  }

  const supabase = getSupabaseAdmin();
  const keyHash = createHash("sha256").update(key).digest("hex");

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, scopes, rate_limit_rpm, is_active")
    .eq("key_hash", keyHash)
    .single();

  if (error || !data) {
    return { valid: false, error: "Invalid API key" };
  }

  if (!data.is_active) {
    return { valid: false, error: "API key has been revoked" };
  }

  // Update last used timestamp (fire-and-forget, don't await)
  supabase.rpc("increment_api_key_usage", { p_key_id: data.id }).then();

  return {
    valid: true,
    keyId: data.id,
    scopes: data.scopes as ApiScope[],
    rateLimitRpm: data.rate_limit_rpm,
  };
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(
  keyId: string,
  reason?: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("api_keys")
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoked_reason: reason || null,
    })
    .eq("id", keyId);

  if (error) {
    throw new Error(`Failed to revoke API key: ${error.message}`);
  }
}

/**
 * List API keys (returns metadata only, never the key itself)
 */
export async function listApiKeys(params?: {
  limit?: number;
  offset?: number;
  activeOnly?: boolean;
}) {
  const supabase = getSupabaseAdmin();
  const { limit = 50, offset = 0, activeOnly = true } = params || {};

  let query = supabase
    .from("api_keys")
    .select(
      "id, key_prefix, name, owner_email, scopes, rate_limit_rpm, is_active, created_at, last_used_at, total_requests"
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list API keys: ${error.message}`);
  }

  return data;
}
