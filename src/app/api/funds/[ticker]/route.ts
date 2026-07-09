import { NextRequest, NextResponse } from "next/server";
import { getFund, inferVehicle } from "@/lib/funds";
import { UNIVERSE } from "@/lib/universe";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase();
  const entry = UNIVERSE.find((u) => u.ticker === t);

  if (!entry) {
    // Allow arbitrary tickers not in the universe. Infer the vehicle from the
    // ticker rather than assuming ETF, so mutual funds (e.g. ABEYX) aren't
    // mislabeled. Category stays "Other" — we have no classification for it.
    try {
      const record = await getFund(t, inferVehicle(t), "Other", "SPY");
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
