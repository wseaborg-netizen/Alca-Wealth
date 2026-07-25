/**
 * SEC subsystem health — server-only diagnostics, protected by CRON_SECRET.
 * Reports capability flags and counts only; never exposes the contact e-mail,
 * credentials, lock keys, or raw errors.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSecHealth } from "@/lib/sec-health";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getSecHealth());
}
