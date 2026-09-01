"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser (client-component) Supabase client.
 * Use this inside "use client" components. For server components / route
 * handlers / server actions, use src/lib/supabase/server.ts instead.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
