import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/** POST /api/auth
 * action: "login"   → email + password → full Supabase session
 * action: "preview" → preview password → sets preview cookie, no session
 * action: "logout"  → clears session + preview cookie
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body as { action: string };

  // ── Preview password login ────────────────────────────────────────────────
  if (action === "preview") {
    const { password } = body as { password: string };
    const expected = process.env.PREVIEW_PASSWORD ?? process.env.APP_PASSWORD;
    if (!expected || password !== expected) {
      return NextResponse.json({ error: "Incorrect preview password" }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, mode: "preview" });
    res.cookies.set("wraith_preview", "1", {
      httpOnly: true, secure: true, sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });
    return res;
  }

  // ── Full Supabase login ───────────────────────────────────────────────────
  if (action === "login") {
    const { email, password } = body as { email: string; password: string };
    const supabase = await createServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return NextResponse.json({ error: error?.message ?? "Login failed" }, { status: 401 });
    }
    return NextResponse.json({ ok: true, mode: "full", user: data.user?.email });
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  if (action === "logout") {
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    const res = NextResponse.json({ ok: true });
    res.cookies.set("wraith_preview", "", { maxAge: 0, path: "/" });
    return res;
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/** GET /api/auth — check current session */
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return NextResponse.json({ mode: "full", user: user.email });
  return NextResponse.json({ mode: "none" });
}
