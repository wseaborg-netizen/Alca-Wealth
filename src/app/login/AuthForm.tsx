"use client";
/**
 * Shared login/signup form — dark ALCA splash styling. Posts to /api/auth;
 * the session lives in httpOnly cookies (no tokens in JS-accessible storage).
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TIMEZONES, detectBrowserTimezone, DEFAULT_TIMEZONE } from "@/lib/profile";

const ui: React.CSSProperties = { fontFamily: "var(--font-text)" };

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const isSignup = mode === "signup";

  // Already signed in? Straight into the platform.
  useEffect(() => {
    fetch("/api/auth").then((r) => r.json())
      .then((d) => { if (d.mode === "full") router.replace("/"); })
      .catch(() => { /* stay on the form */ });
  }, [router]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-detect the browser timezone for signup (manual override below).
  useEffect(() => { if (isSignup) setTimezone(detectBrowserTimezone()); }, [isSignup]);

  const submit = async () => {
    if (!email.trim() || !password) { setErr("Enter your email and password."); return; }
    if (isSignup && (!firstName.trim() || !lastName.trim())) { setErr("Enter your first and last name."); return; }
    setLoading(true); setErr(""); setNote("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode, email: email.trim(), password,
          ...(isSignup ? { firstName: firstName.trim(), lastName: lastName.trim(), timezone } : {}),
        }),
      });
      const d = await res.json();
      if (!res.ok) setErr(d.error ?? "Something went wrong.");
      else if (d.mode === "confirm") setNote("Account created — check your email to confirm, then sign in.");
      else router.push("/");
    } catch { setErr("Network error. Try again."); }
    setLoading(false);
  };

  const input: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "13px 15px", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)",
    color: "#F4F5F7", fontSize: 14.5, outline: "none", ...ui,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0A0B0E", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 26, justifyContent: "center" }}>
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
            <defs><linearGradient id="am" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#5EEAD4" /><stop offset="100%" stopColor="#0E7490" /></linearGradient></defs>
            <rect x="1.2" y="1.2" width="29.6" height="29.6" rx="8" stroke="url(#am)" strokeWidth="1.4" opacity="0.7" />
            <path d="M8 22L16 8l8 14" stroke="url(#am)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11.4 16.2h9.2" stroke="url(#am)" strokeWidth="2.1" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 19, fontWeight: 700, color: "#fff", ...ui }}>ALCA Wealth</span>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16, padding: "28px 26px" }}>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: "#F4F5F7", margin: 0, ...ui }}>
            {mode === "login" ? "Sign in" : "Create your account"}
          </h1>
          <p style={{ fontSize: 12.5, color: "rgba(244,245,247,0.55)", margin: "7px 0 20px", lineHeight: 1.55, ...ui }}>
            {mode === "login"
              ? "Access your research, portfolios, and saved modeling."
              : "A private workspace is created for your account automatically."}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {isSignup && (
              <>
                <div style={{ display: "flex", gap: 10 }}>
                  <input style={input} type="text" placeholder="First name" value={firstName} autoComplete="given-name"
                    onChange={(e) => setFirstName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
                  <input style={input} type="text" placeholder="Last name" value={lastName} autoComplete="family-name"
                    onChange={(e) => setLastName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
                </div>
                <label style={{ fontSize: 11.5, color: "rgba(244,245,247,0.55)", ...ui }}>
                  Time zone
                  <select value={timezone} onChange={(e) => setTimezone(e.target.value)} aria-label="Time zone"
                    style={{ ...input, marginTop: 5, appearance: "auto" }}>
                    {(TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map((tz) => (
                      <option key={tz} value={tz} style={{ color: "#111" }}>{tz.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <input style={input} type="email" placeholder="Email" value={email} autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} />
            <input style={input} type="password" value={password}
              placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} />
            {err && <div role="alert" style={{ fontSize: 12.5, color: "#F87171", ...ui }}>{err}</div>}
            {note && <div role="status" style={{ fontSize: 12.5, color: "#5EEAD4", ...ui }}>{note}</div>}
            <button onClick={submit} disabled={loading}
              style={{ padding: "13px 0", borderRadius: 10, border: "none", cursor: loading ? "default" : "pointer",
                background: "linear-gradient(135deg, #5EEAD4 0%, #0E7490 100%)", color: "#04252E",
                fontSize: 14.5, fontWeight: 700, ...ui, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: "rgba(244,245,247,0.55)", margin: "18px 0 0", textAlign: "center", ...ui }}>
            {mode === "login" ? <>New to ALCA? <a href="/signup" style={{ color: "#5EEAD4" }}>Create an account</a></>
              : <>Already have an account? <a href="/login" style={{ color: "#5EEAD4" }}>Sign in</a></>}
          </p>
        </div>
        <p style={{ fontSize: 11.5, color: "rgba(244,245,247,0.4)", margin: "16px 0 0", textAlign: "center", ...ui }}>
          <Link href="/" style={{ color: "rgba(244,245,247,0.55)" }}>← Back to homepage</Link>
        </p>
      </div>
    </div>
  );
}
