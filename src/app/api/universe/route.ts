import { NextResponse } from "next/server";
import { UNIVERSE } from "@/lib/universe";

// Serves the verified fund universe (clean universe v1) — the only fund list the
// app exposes. Sourced from data/classified_universe.json via @/lib/universe.
export async function GET() {
  return NextResponse.json(UNIVERSE);
}
