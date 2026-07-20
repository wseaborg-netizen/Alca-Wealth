import { NextResponse } from "next/server";
import { requireFirmContext, listsGetAll, fundRequestCounts, dynamicFundCount } from "@/lib/db";
import { getSessionUser } from "@/lib/db";
import { runSystemHealth, type HealthAuthContext } from "@/lib/health";

/**
 * Internal System Health — diagnostic snapshot of ALCA's core subsystems.
 *
 * INTERNAL ONLY. Requires an authenticated session (401 otherwise) so this is
 * never exposed on public pages. The saved-lists check runs firm-scoped through
 * the normal RLS helpers — this route never uses the service-role key and never
 * returns list contents, secrets, raw provider/SQL bodies, or stack traces.
 */
export async function GET() {
  // Require authentication. We surface health only to signed-in (internal) users.
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  // Firm context lets the saved-lists check read lists through RLS. If the user
  // is signed in but has no firm yet, the check degrades to a warning safely.
  const ctx = await requireFirmContext();
  const authCtx: HealthAuthContext = ctx
    ? {
        signedIn: true,
        listsGetAll: async () => {
          const lists = await listsGetAll(ctx.sb, ctx.firm.id, ctx.user.id);
          // Return only counts/types — never names, tickers, or notes.
          return lists.map((l) => ({ name: "", type: l.type, itemCount: l.items.length }));
        },
        fundRequestCounts: () => fundRequestCounts(ctx.sb, ctx.firm.id),
        dynamicFundCount: () => dynamicFundCount(ctx.sb),
      }
    : { signedIn: true };

  try {
    const health = await runSystemHealth(authCtx);
    return NextResponse.json(health, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Orchestrator is defensive, but never let the endpoint 500 with details.
    return NextResponse.json({ error: "Health check failed to run." }, { status: 500 });
  }
}
