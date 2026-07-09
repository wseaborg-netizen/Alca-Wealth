import { NextResponse } from "next/server";
import { UNIVERSE } from "@/lib/universe";

// Serves the verified fund universe — the only fund list the app exposes.
// Sourced from data/generated/fund-universe.json via @/lib/universe.
export async function GET() {
  return NextResponse.json(UNIVERSE);
}
