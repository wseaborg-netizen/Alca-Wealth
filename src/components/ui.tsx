"use client";
import React from "react";
import { T, R, mono, ui, cardStyle } from "./tokens";

// ── Page header - one consistent title/subtitle hierarchy across every screen ──
export function PageHeader({ title, subtitle, actions }: {
  title: string; subtitle?: string; actions?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      gap: 16, marginBottom: 4 }}>
      <div>
        <h1 style={{ ...ui, fontSize: 21, fontWeight: 600, color: T.text, margin: 0,
          letterSpacing: "-0.01em", lineHeight: 1.2 }}>{title}</h1>
        {subtitle && (
          <p style={{ fontSize: 13, color: T.dim, marginTop: 4, ...ui, lineHeight: 1.5, maxWidth: 660 }}>{subtitle}</p>
        )}
      </div>
      {actions && <div style={{ flexShrink: 0, display: "flex", gap: 8, alignItems: "center" }}>{actions}</div>}
    </div>
  );
}

// ── Badge - neutral by default; tone carries meaning, never decoration ──
type BadgeTone = "neutral" | "teal" | "positive" | "warning" | "negative";
export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: BadgeTone }) {
  const map: Record<BadgeTone, { fg: string; bg: string; bd: string }> = {
    neutral:  { fg: T.dim,   bg: T.panel3,       bd: T.line2 },
    teal:     { fg: T.blue,  bg: `${T.blue}14`,  bd: `${T.blue}33` },
    positive: { fg: T.green, bg: `${T.green}16`, bd: `${T.green}33` },
    warning:  { fg: T.amber, bg: `${T.amber}16`, bd: `${T.amber}33` },
    negative: { fg: T.red,   bg: `${T.red}16`,   bd: `${T.red}33` },
  };
  const c = map[tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 9.5, fontWeight: 600,
      letterSpacing: "0.07em", textTransform: "uppercase", color: c.fg, background: c.bg,
      border: `1px solid ${c.bd}`, borderRadius: R.sm, padding: "3px 8px", whiteSpace: "nowrap", ...ui }}>
      {children}
    </span>
  );
}

// ── Button ────────────────────────────────────────────────────────────────────
// Hierarchy: `accent` = primary (filled teal) · default = secondary (bordered) ·
// `ghost` = tertiary (borderless, quiet). Use one primary per view.
export function Btn({
  children, onClick, disabled, accent, ghost, small,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  accent?: boolean;
  ghost?: boolean;
  small?: boolean;
}) {
  const base: React.CSSProperties = {
    borderRadius: R.md, fontWeight: 500, letterSpacing: "0.01em",
    cursor: disabled ? "default" : "pointer",
    transition: "background 0.15s, border-color 0.15s, color 0.15s",
    border: "1px solid", padding: small ? "5px 12px" : "8px 16px",
    fontSize: small ? 12 : 13, lineHeight: 1.2,
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, ...ui,
  };
  if (disabled) return (
    <button disabled style={{ ...base, background: T.panel3, color: T.muted, borderColor: T.line2 }}>
      {children}
    </button>
  );
  if (accent) return (
    <button onClick={onClick} style={{ ...base, background: T.blue, color: "#fff", borderColor: T.blue }}
      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = T.blueD; b.style.borderColor = T.blueD; }}
      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = T.blue; b.style.borderColor = T.blue; }}
    >{children}</button>
  );
  if (ghost) return (
    <button onClick={onClick} style={{ ...base, background: "transparent", color: T.dim, borderColor: "transparent" }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = T.panel2; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >{children}</button>
  );
  return (
    <button onClick={onClick} style={{ ...base, background: T.panel, color: T.text, borderColor: T.line2 }}
      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = T.panel2; b.style.borderColor = T.line; }}
      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = T.panel; b.style.borderColor = T.line2; }}
    >{children}</button>
  );
}

// ── Label ─────────────────────────────────────────────────────────────────────
export function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: T.dim, fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
      textTransform: "uppercase", marginBottom: 6, ...ui }}>
      {children}
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────
export function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="w-full"
      style={{ background: T.panel, color: T.text, border: `1px solid ${T.line2}`,
        borderRadius: 6, outline: "none", padding: "7px 10px", fontSize: 13,
        appearance: "none", cursor: "pointer", ...ui }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      gap: 12, padding: "48px 0", justifyContent: "center" }}>
      <div style={{ position: "relative", width: 32, height: 32 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${T.line2}` }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%",
          border: "2px solid transparent", borderTopColor: T.blue,
          animation: "spin 0.75s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
      <div style={{ color: T.muted, fontSize: 11, letterSpacing: "0.12em",
        textTransform: "uppercase", ...ui }}>{label}</div>
    </div>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────────
export function ErrBanner({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div style={{ background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA",
      borderLeft: `3px solid ${T.red}`, borderRadius: 6, padding: "10px 14px",
      fontSize: 13, margin: "12px 0", ...ui }}>
      {msg}
    </div>
  );
}

// ── KPI cell ──────────────────────────────────────────────────────────────────
export function KPI({ label, value, good, large }: {
  label: string; value: string | number | null | undefined; good?: boolean | null; large?: boolean;
}) {
  const color = good === true ? T.green : good === false ? T.red : T.text;
  return (
    <div>
      <div style={{ color: T.muted, fontSize: 9, fontWeight: 600, letterSpacing: "0.1em",
        textTransform: "uppercase", marginBottom: 3, ...ui }}>{label}</div>
      <div style={{ color, fontSize: large ? 18 : 13, fontWeight: large ? 600 : 500, ...mono }}>
        {value ?? "-"}
      </div>
    </div>
  );
}

// ── Priority chip ─────────────────────────────────────────────────────────────
export function PriorityChip({ label, active, onClick }: {
  label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 12px", fontSize: 11, fontWeight: 500,
      background: active ? T.blueL : "#fff",
      color: active ? T.blueD : T.dim,
      border: `1px solid ${active ? T.blue : T.line2}`,
      borderRadius: 4, cursor: "pointer", transition: "all 0.15s", ...ui,
    }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.borderColor = T.blue; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.borderColor = T.line2; }}
    >{label}</button>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
export function SectionHeader({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: T.text, fontSize: 14, fontWeight: 600, ...ui }}>{children}</div>
      {sub && <div style={{ color: T.dim, fontSize: 12, marginTop: 2, ...ui }}>{sub}</div>}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style, className }: {
  children: React.ReactNode; style?: React.CSSProperties; className?: string;
}) {
  return <div className={className} style={{ ...cardStyle(style) }}>{children}</div>;
}

// ── Rank badge - shows rank + optional total (e.g. "3 /47") ──────────────────
export function RankBadge({ rank, total }: { rank: number; total?: number }) {
  const isFirst = rank === 1;
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", width: 38, height: 38, borderRadius: 8, flexShrink: 0,
      background: isFirst ? T.amber : T.panel3,
      border: `1px solid ${isFirst ? T.amber : T.line2}`, ...mono }}>
      <div style={{ fontSize: 14, fontWeight: 600,
        color: isFirst ? "#fff" : T.dim, lineHeight: 1 }}>{rank}</div>
      {total != null && (
        <div style={{ fontSize: 8, color: isFirst ? "rgba(255,255,255,0.65)" : T.muted,
          lineHeight: 1, marginTop: 1 }}>/{total}</div>
      )}
    </div>
  );
}

// ── Score badge ───────────────────────────────────────────────────────────────
export function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? T.green : score >= 45 ? T.amber : T.red;
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1, ...mono }}>{score}</div>
      <div style={{ fontSize: 9, color: T.muted, letterSpacing: "0.1em",
        textTransform: "uppercase", ...ui }}>score</div>
    </div>
  );
}

// ── Percentile bar ────────────────────────────────────────────────────────────
export function PercentileBar({ label, value, color }: {
  label: string; value: number; color?: string;
}) {
  const barColor = color ?? (value >= 70 ? T.green : value >= 40 ? T.amber : T.red);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between",
        marginBottom: 3, alignItems: "baseline" }}>
        <div style={{ color: T.muted, fontSize: 9, fontWeight: 600,
          letterSpacing: "0.08em", textTransform: "uppercase", ...ui }}>{label}</div>
        <div style={{ color: barColor, fontSize: 10, fontWeight: 600, ...mono }}>{value}</div>
      </div>
      <div style={{ height: 3, background: T.line2, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value}%`, background: barColor,
          borderRadius: 2, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}
