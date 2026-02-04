import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // Use placeholder values during build to prevent prerender errors
  // Real values will be used at runtime
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
  );
}
