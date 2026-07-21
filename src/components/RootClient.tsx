"use client";
/**
 * Client wrapper for the root route. The server (src/app/page.tsx) has already
 * resolved the session, so AppShell mounts with the correct authMode + initial
 * tab immediately — no /api/auth round-trip, no public-homepage flash for
 * authenticated users.
 */
import React from "react";
import AppShell from "@/components/AppShell";
import type { AuthMode } from "@/lib/authView";
import type { TabId } from "@/components/AppShell";

export default function RootClient({ initialAuthMode, initialTab, authUser, authWorkspace }: {
  initialAuthMode: AuthMode; initialTab: TabId; authUser: string | null; authWorkspace: string | null;
}) {
  const authed = initialAuthMode === "full" || initialAuthMode === "preview";
  return (
    <AppShell
      authMode={initialAuthMode}
      authUser={authUser}
      authWorkspace={authWorkspace}
      initialTab={initialTab}
      onLogout={authed ? async () => {
        await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "logout" }) });
        window.location.href = "/"; // clean reload back to the public homepage
      } : undefined}
    />
  );
}
