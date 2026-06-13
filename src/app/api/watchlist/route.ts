import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/** GET /api/watchlist — fetch user's saved tickers */
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ tickers: [] });

  const { data, error } = await supabase
    .from("watchlists")
    .select("ticker, added_at")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });

  if (error) return NextResponse.json({ tickers: [] });
  return NextResponse.json({ tickers: (data ?? []).map((r) => r.ticker) });
}

/** POST /api/watchlist — add a ticker */
export async function POST(req: NextRequest) {
  const { ticker } = await req.json() as { ticker: string };
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { error } = await supabase
    .from("watchlists")
    .upsert({ user_id: user.id, ticker: ticker.toUpperCase() }, { onConflict: "user_id,ticker" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/watchlist — remove a ticker */
export async function DELETE(req: NextRequest) {
  const { ticker } = await req.json() as { ticker: string };
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("user_id", user.id)
    .eq("ticker", ticker.toUpperCase());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
