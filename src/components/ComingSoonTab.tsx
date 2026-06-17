"use client";
import React from "react";
import { T, ui } from "./tokens";

export type RoadmapSpec = {
  id: string; label: string; icon: React.ReactNode;
  title: string; blurb: string; bullets: string[];
};

export default function ComingSoonTab({ spec }: { spec: RoadmapSpec }) {
  return (
    <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h2 style={{ fontSize: 26, fontWeight: 300, color: T.text, margin: 0,
          fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>{spec.label}</h2>
        <p style={{ fontSize: 12, color: T.dim, marginTop: 4, ...ui }}>A planned addition to Alca — not built yet.</p>
      </div>

      <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden" }}>
        {/* dark banner */}
        <div style={{ position: "relative", padding: "26px 28px",
          backgroundImage: "linear-gradient(135deg, #0B0B0C 0%, #161617 60%, #0A0A0B 100%)", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, opacity: 0.05, pointerEvents: "none",
            backgroundImage: "radial-gradient(circle, #FFFFFF 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 13, flexShrink: 0, color: "#FCA5A5",
              background: "var(--c-accent)18", border: "1px solid #7F1D1D", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ transform: "scale(1.5)" }}>{spec.icon}</div>
            </div>
            <div>
              <span style={{ display: "inline-block", fontSize: 9, fontWeight: 600, letterSpacing: "0.05em",
                textTransform: "uppercase", color: "#FCA5A5", background: "var(--c-accent)22", border: "1px solid #7F1D1D",
                borderRadius: 20, padding: "3px 10px", ...ui }}>Coming soon</span>
              <div style={{ fontSize: 21, fontWeight: 600, color: "#FAFAFA", ...ui, marginTop: 8, letterSpacing: "-0.01em" }}>
                {spec.title}
              </div>
            </div>
          </div>
        </div>
        {/* body */}
        <div style={{ padding: "20px 28px 24px" }}>
          <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.6, ...ui, marginBottom: 16, maxWidth: 560 }}>
            {spec.blurb}
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
            color: T.muted, ...ui, marginBottom: 10 }}>What it could do</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 22px" }}>
            {spec.bullets.map((b) => (
              <div key={b} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <span style={{ color: T.data, flexShrink: 0, display: "flex", marginTop: 1 }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span style={{ fontSize: 12.5, color: T.text, lineHeight: 1.5, ...ui }}>{b}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.line}`,
            fontSize: 11.5, color: T.muted, ...ui }}>
            💡 Idea placeholder — tell me to build this out and it becomes a real tool.
          </div>
        </div>
      </div>
    </div>
  );
}
