import { NextResponse } from "next/server";
import { getMergedUniverse } from "@/lib/universeServer";

// Serves the verified fund universe = static base (data/generated/fund-universe.json)
// + verified dynamic funds added via the Expansion Hub, merged server-side.
// Signed-out callers get the static base (RLS returns no dynamic rows) — never an error.
export async function GET() {
  const universe = await getMergedUniverse();
  return NextResponse.json(universe, { headers: { "Cache-Control": "no-store" } });
}
