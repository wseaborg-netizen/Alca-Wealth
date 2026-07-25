import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getSessionUser, prefsGet, prefsSet } from "@/lib/db";

/** Account-level user preferences (RLS: own row only). The device-local
    localStorage prefs remain the fallback for preview/logged-out use. */

export async function GET() {
  const sb = await createServerClient();
  const user = await getSessionUser(sb);
  if (!user) return NextResponse.json({ prefs: null });
  try { return NextResponse.json({ prefs: await prefsGet(sb, user.id) }); }
  catch { return NextResponse.json({ prefs: null }); }
}

export async function POST(req: NextRequest) {
  const { prefs } = await req.json() ?? {};
  if (!prefs || typeof prefs !== "object")
    return NextResponse.json({ error: "prefs object required" }, { status: 400 });
  const sb = await createServerClient();
  const user = await getSessionUser(sb);
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  try { await prefsSet(sb, user.id, prefs); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 }); }
}
