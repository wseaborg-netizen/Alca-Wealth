"use client";
import React from "react";
import { T, ui } from "./tokens";

/**
 * Firm Funds — primary destination shell (Phase 2A).
 *
 * This is an honest, not-yet-configured shell. The real firm-funds data model
 * (the curated table a firm maintains, with its own counts and status) is built
 * in a later stage; this file deliberately introduces NO synthetic funds, counts,
 * or records. The layout is structured so the real table can drop into the
 * `main` region below without another navigation rewrite.
 */
export default function FirmFundsTab() {
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Header */}
      <header>
        <h1 style={{ fontSize: 25, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.02em" }}>
          Firm Funds
        </h1>
        <p style={{ fontSize: 13.5, color: T.dim, ...ui, margin: "8px 0 0", maxWidth: 720, lineHeight: 1.55 }}>
          Your firm&apos;s curated fund shelf — the investments your team has approved for use across
          portfolios and reviews. This workspace is not configured yet.
        </p>
      </header>

      {/* Not-yet-configured state (no synthetic records) */}
      <section
        aria-label="Firm Funds — not configured"
        style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14,
          boxShadow: "var(--c-card-shadow)", padding: "40px 28px", display: "flex",
          flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14 }}>
        <span aria-hidden style={{ width: 46, height: 46, borderRadius: 12, background: T.blueL,
          border: `1px solid ${T.blue}33`, color: T.blue, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M3.5 9.5h17M9 4.5v15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text, ...ui }}>No firm fund shelf yet</div>
          <p style={{ fontSize: 13, color: T.dim, ...ui, margin: "7px auto 0", maxWidth: 460, lineHeight: 1.6 }}>
            Once configured, the funds your firm approves will appear here as a managed table — with
            the metrics, categories, and status your team relies on. Nothing is shown until real data
            exists; no sample records are used.
          </p>
        </div>
      </section>

      {/* Structural placeholder for the future managed table (empty, honest) */}
      <section aria-label="Firm Funds table (pending configuration)"
        style={{ border: `1px dashed ${T.line2}`, borderRadius: 14, padding: "22px 24px",
          color: T.muted, ...ui, fontSize: 12.5, lineHeight: 1.6 }}>
        The managed Firm Funds table will render in this region. It is intentionally empty until the
        firm-funds data model is enabled.
      </section>
    </div>
  );
}
