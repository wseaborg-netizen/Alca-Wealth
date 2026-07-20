/**
 * Profile helpers — PURE (no server/network imports) so they're testable and
 * safe on both client and server. Powers the minimal signup profile and the
 * personalized Advisor Overview greeting.
 */

export interface Profile {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  timezone: string | null;
  onboarding_completed: boolean;
}

export const DEFAULT_TIMEZONE = "America/Chicago";

/** A curated timezone list for the manual override (common US + a few global). */
export const TIMEZONES: string[] = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
  "America/Toronto", "America/Sao_Paulo", "Europe/London", "Europe/Paris",
  "Europe/Zurich", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore",
  "Asia/Hong_Kong", "Asia/Tokyo", "Australia/Sydney", "UTC",
];

/** True when the string is a valid IANA timezone the runtime recognizes. */
export function isValidTimezone(tz: string | null | undefined): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    // Throws a RangeError for an unknown timezone.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Resolve a usable timezone: the detected one if valid, else the default. */
export function resolveTimezone(detected?: string | null): string {
  return isValidTimezone(detected) ? (detected as string) : DEFAULT_TIMEZONE;
}

/** Best-effort browser timezone (client only); safe to call anywhere. */
export function detectBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return resolveTimezone(tz);
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function capitalizeFirst(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Greeting name with the required fallback chain:
 * first name (profile or auth metadata, whichever the caller passes) →
 * email prefix (capitalized) → "Advisor".
 */
export function greetingName(firstName: string | null | undefined, email: string | null | undefined): string {
  const f = firstName?.trim();
  if (f) return f;
  const prefix = email?.split("@")[0]?.trim();
  if (prefix) return capitalizeFirst(prefix);
  return "Advisor";
}

/** A profile is "complete" once it has a first and last name. */
export function profileComplete(p: Pick<Profile, "first_name" | "last_name"> | null | undefined): boolean {
  return !!(p && p.first_name && p.first_name.trim() && p.last_name && p.last_name.trim());
}
