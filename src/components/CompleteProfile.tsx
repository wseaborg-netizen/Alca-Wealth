"use client";
/**
 * Lightweight "Complete your profile" modal — shown once to a signed-in user
 * whose profile has no first/last name (e.g. accounts created before the
 * minimal-profile task). Requires first + last name, confirms timezone, then
 * continues into the app. Never locks the user out: a save failure shows a
 * clear error, and "Not now" dismisses it for the session.
 */
import React, { useEffect, useState } from "react";
import { T, ui } from "./tokens";
import { TIMEZONES, detectBrowserTimezone, profileComplete, type Profile } from "@/lib/profile";

export default function CompleteProfile({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [timezone, setTimezone] = useState("America/Chicago");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    if (typeof window !== "undefined" && sessionStorage.getItem("alca_profile_dismissed") === "1") return;
    let alive = true;
    fetch("/api/profile", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        const p = d.profile as Profile | null;
        if (profileComplete(p)) return;               // already has a name — nothing to do
        if (p?.first_name) setFirstName(p.first_name);
        if (p?.last_name) setLastName(p.last_name);
        setTimezone(p?.timezone || detectBrowserTimezone());
        setOpen(true);
      })
      .catch(() => { /* offline / signed out → don't nag */ });
    return () => { alive = false; };
  }, [active]);

  const dismiss = () => {
    if (typeof window !== "undefined") sessionStorage.setItem("alca_profile_dismissed", "1");
    setOpen(false);
  };

  const save = async () => {
    if (!firstName.trim() || !lastName.trim()) { setError("First and last name are required."); return; }
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/profile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), timezone }),
      });
      if (!r.ok) { const d = await r.json().catch(() => null); setError(d?.error ?? "Could not save. Please try again."); return; }
      setOpen(false);
    } catch {
      setError("Network error. Please try again.");
    } finally { setSaving(false); }
  };

  if (!open) return null;

  const input: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 9,
    border: `1px solid ${T.line2}`, background: T.panel, color: T.text, fontSize: 14, outline: "none", ...ui,
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Complete your profile"
      style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={dismiss} aria-hidden style={{ position: "absolute", inset: 0, background: "rgba(10,12,16,0.55)" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: 420, background: T.bg, border: `1px solid ${T.line}`,
        borderRadius: 16, padding: "24px 24px 22px", boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: T.text, ...ui, margin: 0 }}>Complete your profile</h2>
        <p style={{ fontSize: 13, color: T.dim, ...ui, margin: "8px 0 18px", lineHeight: 1.55 }}>
          Add your name so we can personalize your Advisor Hub. This takes a few seconds.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <input style={input} placeholder="First name" value={firstName} autoFocus autoComplete="given-name"
              onChange={(e) => setFirstName(e.target.value)} />
            <input style={input} placeholder="Last name" value={lastName} autoComplete="family-name"
              onChange={(e) => setLastName(e.target.value)} />
          </div>
          <label style={{ fontSize: 11.5, color: T.muted, ...ui }}>
            Time zone
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} aria-label="Time zone"
              style={{ ...input, marginTop: 5 }}>
              {(TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map((tz) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
              ))}
            </select>
          </label>
          {error && <div role="alert" style={{ fontSize: 12.5, color: T.red, ...ui }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={() => void save()} disabled={saving}
              style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "none", cursor: saving ? "default" : "pointer",
                background: T.blue, color: "#fff", fontSize: 14, fontWeight: 700, ...ui, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Saving…" : "Save & continue"}
            </button>
            <button onClick={dismiss} disabled={saving}
              style={{ padding: "11px 16px", borderRadius: 9, border: `1px solid ${T.line2}`, background: T.panel,
                color: T.dim, fontSize: 13, fontWeight: 600, cursor: "pointer", ...ui }}>Not now</button>
          </div>
        </div>
      </div>
    </div>
  );
}
