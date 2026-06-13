import { NextRequest, NextResponse } from "next/server";

/** POST /api/auth
 * action: "login"   → email + password → full Supabase session
 * action: "preview" → preview password → sets preview cookie, no session
 * action: "logout"  → clears session + preview cookie
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body as { action: string };

    // ── Preview password login ──────────────────────────────────────────────
    if (action === "preview") {
      const { password } = body as { password: string };
      const expected = (process.env.PREVIEW_PASSWORD ?? process.env.APP_PASSWORD ?? "").trim();
      // Distinguish "server not configured" from "wrong password" so the cause is obvious.
      if (!expected) {
        return NextResponse.json(
          { error: "Preview access isn't set up on the server yet — add PREVIEW_PASSWORD in Vercel and redeploy." },
          { status: 503 },
        );
      }
      if ((password ?? "").trim() !== expected) {
        return NextResponse.json({ error: "Incorrect preview password" }, { status: 401 });
      }
      const res = NextResponse.json({ ok: true, mode: "preview" });
      res.cookies.set("lynx_preview", "1", {
        httpOnly: true, secure: true, sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
      return res;
    }

    // ── Full Supabase login ─────────────────────────────────────────────────
    if (action === "login") {
      const { email, password } = body as { email: string; password: string };
      const { createServerClient } = await import("@/lib/supabase");
      const supabase = await createServerClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        return NextResponse.json({ error: error?.message ?? "Login failed" }, { status: 401 });
      }
      return NextResponse.json({ ok: true, mode: "full", user: data.user?.email });
    }

    // ── Logout ─────────────────────────────────────────────────────────────
    if (action === "logout") {
      const { createServerClient } = await import("@/lib/supabase");
      const supabase = await createServerClient();
      await supabase.auth.signOut();
      const res = NextResponse.json({ ok: true });
      res.cookies.set("lynx_preview", "", { maxAge: 0, path: "/" });
      return res;
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  } catch (err) {
    console.error("[api/auth] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}

/** GET /api/auth — check current session */
export async function GET(req: NextRequest) {
  try {
    // Check preview cookie first (doesn't need Supabase)
    const preview = req.cookies.get("lynx_preview");
    if (preview?.value === "1") {
      return NextResponse.json({ mode: "preview" });
    }

    const { createServerClient } = await import("@/lib/supabase");
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return NextResponse.json({ mode: "full", user: user.email });
    return NextResponse.json({ mode: "none" });
  } catch (err) {
    console.error("[api/auth GET] error:", err);
    return NextResponse.json({ mode: "none" });
  }
}
