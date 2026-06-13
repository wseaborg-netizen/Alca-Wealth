/**
 * Supabase client helpers — three exports:
 *  - createBrowserClient()  → use in Client Components
 *  - createServerClient()   → use in Server Components / API routes
 *  - supabaseAdmin          → service-role client for admin ops (server only)
 */
import { createBrowserClient as _browser } from "@supabase/ssr";
import { createServerClient as _server, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVCRL = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Browser client — for use inside "use client" components */
export function createBrowserClient() {
  return _browser(URL, ANON);
}

/** Server client — reads/writes cookies for session */
export async function createServerClient() {
  const cookieStore = await cookies();
  return _server(URL, ANON, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value; },
      set(name: string, value: string, options: CookieOptions) {
        try { cookieStore.set({ name, value, ...options }); } catch { /* read-only in some contexts */ }
      },
      remove(name: string, options: CookieOptions) {
        try { cookieStore.set({ name, value: "", ...options }); } catch { /* read-only in some contexts */ }
      },
    },
  });
}

/** Admin client — bypasses RLS, server only */
export const supabaseAdmin = createClient(URL, SVCRL, {
  auth: { autoRefreshToken: false, persistSession: false },
});
