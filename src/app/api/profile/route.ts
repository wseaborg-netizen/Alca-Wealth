import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getSessionUser, profileGet, profileUpsert } from "@/lib/db";
import { resolveTimezone, greetingName } from "@/lib/profile";

/**
 * Current user's minimal profile (RLS: own row only).
 *
 * GET  → the profile + a resolved `greeting` first name (profile first_name →
 *        auth metadata first_name → email prefix → "Advisor"). Signed out → 401.
 * POST → update first/last/display name + timezone; marks onboarding complete
 *        once a full name is present. No secrets are ever returned.
 */
export async function GET() {
  const sb = await createServerClient();
  const user = await getSessionUser(sb);
  if (!user) return NextResponse.json({ profile: null }, { status: 401 });
  try {
    const profile = await profileGet(sb, user.id);
    const metaFirst = (user.user_metadata?.first_name as string | undefined) ?? null;
    const greeting = greetingName(profile?.first_name ?? metaFirst, user.email ?? null);
    return NextResponse.json({ profile, greeting });
  } catch {
    // Never lock the user out — return a safe fallback greeting.
    return NextResponse.json({ profile: null, greeting: greetingName(null, user.email ?? null) });
  }
}

export async function POST(req: NextRequest) {
  const sb = await createServerClient();
  const user = await getSessionUser(sb);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    firstName?: string; lastName?: string; displayName?: string; timezone?: string;
  } | null;

  const firstName = body?.firstName?.trim() ?? "";
  const lastName = body?.lastName?.trim() ?? "";
  if (!firstName || !lastName) {
    return NextResponse.json({ error: "First and last name are required." }, { status: 400 });
  }

  const timezone = resolveTimezone(body?.timezone);
  const displayName = body?.displayName?.trim() || `${firstName} ${lastName}`;
  try {
    const profile = await profileUpsert(sb, user.id, user.email ?? null, {
      firstName, lastName, displayName, timezone, onboardingCompleted: true,
    });
    return NextResponse.json({ profile, greeting: greetingName(profile.first_name, user.email ?? null) });
  } catch {
    return NextResponse.json({ error: "Could not save your profile. Please try again." }, { status: 500 });
  }
}
