import { NextResponse } from "next/server";
import { getUniverseCounts } from "@/lib/universeServer";

// Lightweight merged fund count (static base + verified dynamic overlay).
// Public: signed-out callers get the static base (RLS returns no dynamic rows);
// signed-in callers get the live merged count. No secrets, counts only.
export async function GET() {
  const counts = await getUniverseCounts();
  return NextResponse.json(counts, { headers: { "Cache-Control": "no-store" } });
}
