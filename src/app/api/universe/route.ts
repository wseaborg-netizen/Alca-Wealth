import { NextResponse } from "next/server";
import universeData from "@/../data/universe.json";

export async function GET() {
  return NextResponse.json(universeData);
}
