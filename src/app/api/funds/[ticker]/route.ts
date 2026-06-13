import { NextRequest, NextResponse } from "next/server";
import { getFund } from "@/lib/funds";
import universeData from "@/../data/universe.json";

type UniverseEntry = { ticker: string; name: string; category: string; vehicle: string; benchmark: string };
const UNIVERSE = universeData as UniverseEntry[];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase();
  const entry = UNIVERSE.find((u) => u.ticker === t);

  if (!entry) {
    // Allow arbitrary tickers for compare view
    try {
      const record = await getFund(t, "ETF", "Other", "SPY");
      return NextResponse.json(record);
    } catch {
      return NextResponse.json({ error: `Ticker ${t} not found` }, { status: 404 });
    }
  }

  try {
    const record = await getFund(entry.ticker, entry.vehicle, entry.category, entry.benchmark);
    return NextResponse.json(record);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
