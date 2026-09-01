import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client for Server Components, Route Handlers, and
 * Server Actions. Reads/writes the auth session via Next.js cookies().
 *
 * NOTE: calling `.set()` from a Server Component (not a Route Handler or
 * Server Action) will throw — that's expected and safe to ignore as long as
 * middleware.ts is refreshing the session on every request (see
 * src/lib/supabase/middleware.ts and root middleware.ts).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — ignore, middleware handles
            // session refresh on the request/response cycle instead.
          }
        },
      },
    },
  );
}

/**
 * Admin/service-role client for privileged server-only operations
 * (e.g. Edge Functions, trusted server actions that must bypass RLS).
 * NEVER import this into client components or expose the service key
 * to the browser.
 */
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
