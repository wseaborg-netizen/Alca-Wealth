/**
 * Root route — SERVER component with session detection BEFORE render.
 *
 *   Anonymous  → public homepage (HomeTab inside AppShell).
 *   Signed in  → Advisor Overview immediately (no marketing flash, no extra
 *                click, no client redirect flicker).
 *
 * The session is read server-side (Supabase cookie + preview cookie) so the very
 * first HTML already reflects the right surface. The workspace is still fully
 * reachable — the brand mark / "About ALCA" open the public homepage while the
 * user stays authenticated.
 */
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { getSessionUser, getDefaultFirm } from "@/lib/db";
import RootClient from "@/components/RootClient";
import { resolveInitialTab, type AuthMode } from "@/lib/authView";

export const dynamic = "force-dynamic"; // per-request session detection

export default async function Page() {
  const cookieStore = await cookies();
  let authMode: AuthMode = "none";
  let authUser: string | null = null;
  let authWorkspace: string | null = null;

  if (cookieStore.get("lynx_preview")?.value === "1") {
    authMode = "preview";
  } else {
    try {
      const sb = await createServerClient();
      const user = await getSessionUser(sb);
      if (user) {
        authMode = "full";
        authUser = user.email ?? null;
        const firm = await getDefaultFirm(sb).catch(() => null);
        authWorkspace = firm?.name ?? null;
      }
    } catch { /* treat as anonymous on any auth error */ }
  }

  return (
    <RootClient
      initialAuthMode={authMode}
      initialTab={resolveInitialTab(authMode)}
      authUser={authUser}
      authWorkspace={authWorkspace}
    />
  );
}
