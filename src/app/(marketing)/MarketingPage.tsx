import React from "react";
import Link from "next/link";

/**
 * Shared frame for the public marketing/support pages (/about, /contact,
 * /security). Server-rendered, dark ALCA branding, zero app code — these
 * pages are public and indexable.
 */

const ui: React.CSSProperties = { fontFamily: "var(--font-text)" };

export function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs><linearGradient id="mk" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#5EEAD4" /><stop offset="100%" stopColor="#0E7490" /></linearGradient></defs>
      <rect x="1.2" y="1.2" width="29.6" height="29.6" rx="8" stroke="url(#mk)" strokeWidth="1.4" opacity="0.7" />
      <path d="M8 22L16 8l8 14" stroke="url(#mk)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.4 16.2h9.2" stroke="url(#mk)" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

export function MarketingPage({ title, lead, children, authed = false }: {
  title: string; lead: string; children: React.ReactNode; authed?: boolean;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "#0A0B0E", color: "#F4F5F7" }}>
      <header style={{ maxWidth: 860, margin: "0 auto", padding: "26px 24px 0",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <Mark />
          <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", ...ui }}>ALCA Wealth</span>
        </Link>
        <nav style={{ display: "flex", gap: 18, alignItems: "center" }}>
          {[["About", "/about"], ["Security", "/security"], ["Request Demo", "/contact"]].map(([label, href]) => (
            <Link key={href} href={href} style={{ fontSize: 13, color: "rgba(244,245,247,0.6)", textDecoration: "none", ...ui }}>{label}</Link>
          ))}
          {authed ? (
            // Signed-in visitors return straight to the workspace (root → Advisor
            // Overview via server session detection) — they are NOT signed out.
            <Link href="/" style={{ fontSize: 12.5, fontWeight: 600, color: "#04252E", textDecoration: "none",
              background: "linear-gradient(135deg, #5EEAD4 0%, #0E7490 100%)", borderRadius: 8, padding: "9px 15px", ...ui }}>
              Return to Workspace
            </Link>
          ) : (
            <Link href="/login" style={{ fontSize: 12.5, fontWeight: 600, color: "#04252E", textDecoration: "none",
              background: "linear-gradient(135deg, #5EEAD4 0%, #0E7490 100%)", borderRadius: 8, padding: "9px 15px", ...ui }}>
              Sign in
            </Link>
          )}
        </nav>
      </header>
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "56px 24px 72px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 700, margin: 0, letterSpacing: "-0.02em", ...ui }}>{title}</h1>
        <p style={{ fontSize: 16, color: "rgba(244,245,247,0.65)", lineHeight: 1.65, margin: "14px 0 36px", maxWidth: 640, ...ui }}>{lead}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>{children}</div>
      </main>
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "22px 24px 30px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", fontSize: 11.5, color: "rgba(244,245,247,0.4)", lineHeight: 1.6, ...ui }}>
          ALCA Wealth is research and modeling software for financial advisors. It does not provide
          investment advice, and modeled results are illustrative — not forecasts or guarantees.
        </div>
      </footer>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 10px", ...ui }}>{heading}</h2>
      <div style={{ fontSize: 14, color: "rgba(244,245,247,0.7)", lineHeight: 1.7, maxWidth: 680, ...ui }}>{children}</div>
    </section>
  );
}
