/**
 * Auth-aware initial view resolution — PURE (no imports), shared by the
 * server root page and tests.
 *
 * Signed-in (full/preview) → the workspace opens straight on the Advisor
 * Overview ("dashboard"); anonymous visitors get the public homepage ("home").
 * Deciding this server-side means an authenticated user never sees a
 * public-homepage flash before landing in the software.
 */
export type AuthMode = "none" | "preview" | "full";

export function isAuthed(mode: AuthMode): boolean {
  return mode === "full" || mode === "preview";
}

/** The tab the workspace should mount first for a given auth mode. */
export function resolveInitialTab(mode: AuthMode): "home" | "dashboard" {
  return isAuthed(mode) ? "dashboard" : "home";
}
