"use client";
import React from "react";
import { T, ui } from "./tokens";

/**
 * Reviews — primary destination shell (Phase 2A).
 *
 * Honest, not-yet-configured shell. The real review workflow (review cases,
 * their status, and the reviewer flow) is built in a later stage; this file
 * introduces NO synthetic review cases, counts, or records. The layout is
 * structured so the real review list/workflow can drop into the region below
 * without another navigation rewrite.
 */
export default function ReviewsTab() {
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Header */}
      <header>
        <h1 style={{ fontSize: 25, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.02em" }}>
          Reviews
        </h1>
        <p style={{ fontSize: 13.5, color: T.dim, ...ui, margin: "8px 0 0", maxWidth: 720, lineHeight: 1.55 }}>
          Structured fund and portfolio reviews — the recurring diligence your team runs on the
          investments it uses. This workspace is not configured yet.
        </p>
      </header>

      {/* Not-yet-configured state (no synthetic cases) */}
      <section
        aria-label="Reviews — not configured"
        style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14,
          boxShadow: "var(--c-card-shadow)", padding: "40px 28px", display: "flex",
          flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14 }}>
        <span aria-hidden style={{ width: 46, height: 46, borderRadius: 12, background: T.blueL,
          border: `1px solid ${T.blue}33`, color: T.blue, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M6 3.5h9l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M14.5 3.5V8h4.5M8.5 13l2 2 3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text, ...ui }}>No reviews yet</div>
          <p style={{ fontSize: 13, color: T.dim, ...ui, margin: "7px auto 0", maxWidth: 460, lineHeight: 1.6 }}>
            Once configured, your review cases will appear here with their status and history. Nothing
            is shown until real reviews exist; no sample cases are used.
          </p>
        </div>
      </section>

      {/* Structural placeholder for the future review workflow (empty, honest) */}
      <section aria-label="Reviews workflow (pending configuration)"
        style={{ border: `1px dashed ${T.line2}`, borderRadius: 14, padding: "22px 24px",
          color: T.muted, ...ui, fontSize: 12.5, lineHeight: 1.6 }}>
        The review list and workflow will render in this region. It is intentionally empty until the
        reviews data model is enabled.
      </section>
    </div>
  );
}
