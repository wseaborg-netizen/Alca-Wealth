/**
 * Server-side auth-mode detection for pages/layouts (reads the Supabase cookie
 * session + preview cookie). SERVER ONLY — uses next/headers.
 */
import { cookies } from "next/headers";
import { createServerClient } from "./supabase";
import { getSessionUser } from "./db";
import type { AuthMode } from "./authView";

export async function getServerAuthMode(): Promise<AuthMode> {
  const c = await cookies();
  if (c.get("lynx_preview")?.value === "1") return "preview";
  try {
    const sb = await createServerClient();
    const user = await getSessionUser(sb);
    return user ? "full" : "none";
  } catch {
    return "none";
  }
}
