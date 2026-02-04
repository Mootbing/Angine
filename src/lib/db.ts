import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Singleton clients
let supabaseClient: SupabaseClient | null = null;
let supabaseAdmin: SupabaseClient | null = null;

/**
 * Get Supabase client for browser/API routes (uses anon key with RLS)
 */
export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  supabaseClient = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseClient;
}

/**
 * Get Supabase admin client (uses service role key, bypasses RLS)
 * Only use server-side for worker and admin operations
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdmin) return supabaseAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase admin environment variables");
  }

  supabaseAdmin = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseAdmin;
}

/**
 * Database helper for common operations
 */
export const db = {
  client: () => getSupabaseClient(),
  admin: () => getSupabaseAdmin(),
};
