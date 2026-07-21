"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { T, ui, mono } from "./tokens";
import { loadClients, riskLabel, type Client } from "../lib/client";
import { type UniverseFund } from "../lib/universe";
import { useMergedUniverse } from "../lib/universeClient";

// Destinations the hub cards can route to (mapped to real tabs in AppShell).
export type HubDest =
  | "discover" | "clientmatch" | "compare" | "analysis" | "watchlist" | "replacements"
  | "build" | "improve" | "portfolios" | "model" | "opportunity";

// ── Simple, consistent icons for the hub items ──
const mk = (p: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">{p}</svg>
);
const ICONS: Record<string, React.ReactNode> = {
  discover: mk(<><circle cx="7.2" cy="7.2" r="5" stroke="currentColor" strokeWidth="1.4" /><circle cx="7.2" cy="7.2" r="1.7" stroke="currentColor" strokeWidth="1.3" /><line x1="10.9" y1="10.9" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>),
  compare: mk(<><path d="M2 4h5v8H2zM9 2h5v10H9z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></>),
  analysis: mk(<><rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M5 9l2-2 1.5 1.5L11 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><line x1="5" y1="4" x2="11" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></>),
  watchlist: mk(<><path d="M8 2.5l1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 11.3l-3.4 1.7.7-3.8L2.5 6.5l3.8-.5L8 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></>),
  replace: mk(<><path d="M3 6a5 5 0 0 1 8.5-2.5M13 4v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M13 10a5 5 0 0 1-8.5 2.5M3 12V9h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></>),
  build: mk(<><path d="M8 1.8V8l5.4 3.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.4" /></>),
  portfolios: mk(<><rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><line x1="4.5" y1="6" x2="11.5" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><line x1="4.5" y1="8.5" x2="11.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><line x1="4.5" y1="11" x2="8.5" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></>),
  opportunity: mk(<><path d="M8 1.5a4.3 4.3 0 0 0-2.6 7.7c.4.3.6.8.6 1.3v.5h4v-.5c0-.5.2-1 .6-1.3A4.3 4.3 0 0 0 8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><line x1="6.4" y1="13.5" x2="9.6" y2="13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></>),
};

const SecLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11.5, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{children}</div>
);

const section: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };

// ════════════════════════════════════════════════════════════════════════════
//  Research Workspace — a light institutional research workstation.
//  Search-first, with clear subnavigation into the existing tools. All
//  destinations route through hubGo / onAnalyze; no duplicated logic.
// ════════════════════════════════════════════════════════════════════════════

/** Universal investment search — typeahead over the real classified universe.
    Selecting a fund opens the existing Analysis tool for that ticker. */
function UniversalSearch({ go, onAnalyze, inputRef }: {
  go: (d: HubDest) => void; onAnalyze?: (t: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const { funds: universe } = useMergedUniverse();

  const matches: UniverseFund[] = useMemo(() => {
    const s = q.trim().toUpperCase();
    if (!s) return [];
    const byTicker = universe.filter((f) => f.ticker.startsWith(s));
    const rest = universe.filter((f) =>
      !f.ticker.startsWith(s) &&
      (f.name.toUpperCase().includes(s) || f.category.toUpperCase().includes(s)));
    return [...byTicker, ...rest].slice(0, 7);
  }, [q, universe]);

  const pick = (t: string) => {
    setOpen(false); setQ(""); setHi(0);
    if (onAnalyze) onAnalyze(t); else go("analysis");
  };
  const submit = () => {
    if (matches.length) pick(matches[Math.min(hi, matches.length - 1)].ticker);
    else go("discover");
  };

  return (
    <div
      style={{ position: "relative" }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 380px", minWidth: 0 }}>
          <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: T.muted, display: "flex" }}>
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" />
              <line x1="10.6" y1="10.6" x2="14.2" y2="14.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
            onFocus={() => q.trim() && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); submit(); }
              else if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
              else if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Search by ticker, fund name, or category"
            aria-label="Search investments"
            aria-expanded={open && matches.length > 0}
            role="combobox" aria-autocomplete="list"
            style={{ width: "100%", boxSizing: "border-box", padding: "15px 16px 15px 44px",
              background: T.panel, border: `1px solid ${T.line2}`, borderRadius: 12,
              fontSize: 15, color: T.text, outline: "none", ...ui,
              boxShadow: "var(--elev-1)", transition: "border-color 0.15s" }} />
        </div>
        <button onClick={submit}
          style={{ padding: "0 26px", borderRadius: 12, border: "none", cursor: "pointer",
            background: T.blue, color: "#fff", fontSize: 14.5, fontWeight: 600, ...ui,
            transition: "background 0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = T.blueD)}
          onMouseLeave={(e) => (e.currentTarget.style.background = T.blue)}>
          Search
        </button>
        <button onClick={() => go("discover")}
          style={{ padding: "0 20px", borderRadius: 12, cursor: "pointer",
            background: T.panel, border: `1px solid ${T.line2}`, color: T.dim,
            fontSize: 14, fontWeight: 600, ...ui, transition: "all 0.15s" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.muted; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.dim; e.currentTarget.style.borderColor = T.line2; }}>
          Screen Funds
        </button>
      </div>

      {/* typeahead suggestions — real universe data */}
      {open && matches.length > 0 && (
        <div role="listbox" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 30,
          background: T.panel, border: `1px solid ${T.line2}`, borderRadius: 12, overflow: "hidden",
          boxShadow: "var(--elev-3)" }}>
          {matches.map((f, i) => (
            <button key={f.ticker} role="option" aria-selected={i === hi}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(f.ticker)}
              onMouseEnter={() => setHi(i)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "11px 16px",
                border: "none", cursor: "pointer", textAlign: "left",
                background: i === hi ? T.blueL : "transparent",
                borderBottom: i < matches.length - 1 ? `1px solid ${T.line}` : "none" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.blue, ...mono, width: 56, flexShrink: 0 }}>{f.ticker}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.text, ...ui,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              <span style={{ fontSize: 10.5, color: T.muted, ...ui, flexShrink: 0 }}>{f.category}</span>
              <span style={{ fontSize: 9.5, fontWeight: 600, color: T.dim, background: T.panel3,
                border: `1px solid ${T.line2}`, borderRadius: 5, padding: "2px 7px", ...ui, flexShrink: 0 }}>{f.vehicle}</span>
            </button>
          ))}
          <div style={{ padding: "8px 16px", fontSize: 10.5, color: T.muted, ...ui, background: T.panel2 }}>
            ↵ opens Analyze Fund · or open Screen Funds to filter the full universe
          </div>
        </div>
      )}
    </div>
  );
}

/** Primary workflow panel — description + one primary and n secondary actions. */
function WorkflowPanel({ iconKey, title, desc, primary, secondaries }: {
  iconKey: string; title: string; desc: string;
  primary: [string, () => void]; secondaries: [string, () => void][];
}) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: T.panel, border: `1px solid ${hover ? T.line2 : T.line}`, borderRadius: 14,
        boxShadow: hover ? "var(--elev-2)" : "var(--c-card-shadow)", padding: "24px 24px 22px",
        display: "flex", flexDirection: "column", gap: 14, minWidth: 0,
        transition: "box-shadow 0.18s, border-color 0.18s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: T.blueL,
          border: `1px solid ${T.blue}33`, color: T.blue,
          display: "flex", alignItems: "center", justifyContent: "center" }}>{ICONS[iconKey]}</span>
        <span style={{ fontSize: 16.5, fontWeight: 700, color: T.text, ...ui }}>{title}</span>
      </div>
      <p style={{ fontSize: 13, color: T.dim, ...ui, lineHeight: 1.6, margin: 0, flex: 1 }}>{desc}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button onClick={primary[1]}
          style={{ padding: "10px 16px", borderRadius: 9, border: "none", cursor: "pointer",
            background: T.blue, color: "#fff", fontSize: 13, fontWeight: 600, ...ui, transition: "background 0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = T.blueD)}
          onMouseLeave={(e) => (e.currentTarget.style.background = T.blue)}>
          {primary[0]}
        </button>
        {secondaries.map(([label, fn]) => (
          <button key={label} onClick={fn}
            style={{ padding: "10px 15px", borderRadius: 9, cursor: "pointer",
              background: T.panel, border: `1px solid ${T.line2}`, color: T.dim,
              fontSize: 13, fontWeight: 600, ...ui, transition: "all 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.muted; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.dim; e.currentTarget.style.borderColor = T.line2; }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Static tool previews — miniature, clearly illustrative interfaces ────────
// (pvWrap + ToolPanel are exported so other hubs — e.g. Model — reuse the
//  exact same launchpad pattern instead of rebuilding it.)
const PV = { h: 132 };
export const pvWrap: React.CSSProperties = { background: T.panel2, border: `1px solid ${T.line}`,
  borderRadius: 11, overflow: "hidden", flexShrink: 0 };
const pvRow = (y: number, w1: number, key: string) => (
  <g key={key}>
    <rect x="10" y={y} width="150" height="16" rx="5" fill="var(--c-panel)" stroke="var(--c-line)" strokeWidth="0.8" />
    <rect x="16" y={y + 5} width="26" height="6" rx="3" fill="#0E7490" opacity="0.75" />
    <rect x="50" y={y + 5.5} width={w1} height="5" rx="2.5" fill="var(--c-muted)" opacity="0.4" />
    <rect x="128" y={y + 5} width="24" height="6" rx="3" fill="#0891B2" opacity="0.55" />
  </g>
);

function PvScreen() {
  return (
    <div style={pvWrap} aria-hidden>
      <svg viewBox="0 0 260 132" width="100%" style={{ display: "block" }}>
        {/* mini style matrix */}
        {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
          <rect key={`${r}${c}`} x={12 + c * 22} y={12 + r * 22} width="18" height="18" rx="4"
            fill={r === 0 && c === 1 ? "#0E7490" : "var(--c-panel)"} stroke="var(--c-line2)" strokeWidth="0.8" />
        )))}
        {/* filter chips */}
        <rect x="88" y="14" width="76" height="16" rx="8" fill="var(--c-blueL)" stroke="#0E749044" strokeWidth="0.8" />
        <text x="126" y="25" textAnchor="middle" fontSize="8" fill="#0E7490" fontFamily="'Geist', sans-serif">Expense &lt; 0.20%</text>
        <rect x="170" y="14" width="60" height="16" rx="8" fill="var(--c-panel)" stroke="var(--c-line2)" strokeWidth="0.8" />
        <text x="200" y="25" textAnchor="middle" fontSize="8" fill="var(--c-muted)" fontFamily="'Geist', sans-serif">US Equity</text>
        <text x="88" y="52" fontSize="9" fontWeight="700" fill="var(--c-text)" fontFamily="'Geist', sans-serif">142 funds match</text>
        {pvRow(64, 60, "a")}{pvRow(86, 44, "b")}{pvRow(108, 52, "c")}
        <text x="170" y="70" fontSize="7.5" fill="var(--c-muted)" fontFamily="'Geist', sans-serif">ranked</text>
      </svg>
    </div>
  );
}

function PvSimilar() {
  return (
    <div style={pvWrap} aria-hidden>
      <svg viewBox="0 0 260 132" width="100%" style={{ display: "block" }}>
        <rect x="12" y="52" width="58" height="24" rx="7" fill="#0E7490" />
        <text x="41" y="68" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" fontFamily="'Geist Mono', monospace">VWO</text>
        {[24, 64, 104].map((y, i) => (
          <g key={y}>
            <path d={`M70 64 C 92 64, 92 ${y + 12}, 112 ${y + 12}`} fill="none" stroke="var(--c-line2)" strokeWidth="1.1" />
            <rect x="112" y={y} width="136" height="24" rx="7" fill="var(--c-panel)" stroke="var(--c-line)" strokeWidth="0.8" />
            <rect x="120" y={y + 8} width="28" height="8" rx="4" fill="#0891B2" opacity="0.8" />
            <text x="158" y={y + 15.5} fontSize="7.5" fill="var(--c-dim)" fontFamily="'Geist', sans-serif">{["0.08% ER", "0.11% ER", "0.14% ER"][i]}</text>
            <rect x="204" y={y + 6} width="36" height="12" rx="6" fill="var(--c-blueL)" />
            <text x="222" y={y + 15} textAnchor="middle" fontSize="7" fill="#0E7490" fontFamily="'Geist', sans-serif">{["Fit 94", "Fit 91", "Fit 88"][i]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function PvClient() {
  return (
    <div style={pvWrap} aria-hidden>
      <svg viewBox="0 0 260 132" width="100%" style={{ display: "block" }}>
        {(["Risk", "Horizon", "Income"] as const).map((l, i) => (
          <g key={l}>
            <text x="12" y={22 + i * 24} fontSize="8" fill="var(--c-muted)" fontFamily="'Geist', sans-serif">{l}</text>
            <rect x="58" y={16 + i * 24} width="120" height="5" rx="2.5" fill="var(--c-panel3)" />
            <rect x="58" y={16 + i * 24} width={[84, 96, 48][i]} height="5" rx="2.5" fill="#0E7490" opacity="0.8" />
            <circle cx={58 + [84, 96, 48][i]} cy={18.5 + i * 24} r="5" fill="var(--c-panel)" stroke="#0E7490" strokeWidth="1.4" />
          </g>
        ))}
        {pvRow(88, 58, "m1")}{pvRow(110, 46, "m2")}
        <text x="196" y="80" fontSize="7.5" fill="var(--c-muted)" fontFamily="'Geist', sans-serif">ranked matches</text>
      </svg>
    </div>
  );
}

function PvCompare() {
  return (
    <div style={pvWrap} aria-hidden>
      <svg viewBox="0 0 260 132" width="100%" style={{ display: "block" }}>
        {[0, 1, 2].map((c) => (
          <g key={c}>
            <rect x={14 + c * 80} y="10" width="72" height="112" rx="8" fill="var(--c-panel)" stroke={c === 0 ? "#0E749055" : "var(--c-line)"} strokeWidth="0.9" />
            <rect x={22 + c * 80} y="18" width="28" height="8" rx="4" fill={["#0E7490", "#0891B2", "#155E75"][c]} opacity="0.85" />
            <path d={`M${22 + c * 80} ${58 - c * 3} C ${40 + c * 80} ${50 - c * 2}, ${58 + c * 80} ${44 + c * 4}, ${78 + c * 80} ${36 + c * 5}`}
              fill="none" stroke={["#0E7490", "#0891B2", "#155E75"][c]} strokeWidth="1.6" strokeLinecap="round" />
            {[70, 84, 98].map((y) => (
              <rect key={y} x={22 + c * 80} y={y} width={[44, 34, 40][(y / 14) % 3 | 0] - c * 4} height="5" rx="2.5" fill="var(--c-muted)" opacity="0.35" />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

function PvAnalyze() {
  return (
    <div style={pvWrap} aria-hidden>
      <svg viewBox="0 0 260 132" width="100%" style={{ display: "block" }}>
        <rect x="12" y="12" width="34" height="16" rx="5" fill="#0E7490" />
        <text x="29" y="23" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" fontFamily="'Geist Mono', monospace">VTI</text>
        <rect x="54" y="15" width="110" height="8" rx="4" fill="var(--c-muted)" opacity="0.4" />
        {["Return", "Risk", "Expense"].map((l, i) => (
          <g key={l}>
            <rect x={12 + i * 82} y="40" width="74" height="30" rx="7" fill="var(--c-panel)" stroke="var(--c-line)" strokeWidth="0.8" />
            <text x={20 + i * 82} y="53" fontSize="7" fill="var(--c-muted)" fontFamily="'Geist', sans-serif">{l}</text>
            <rect x={20 + i * 82} y="58" width={[34, 26, 30][i]} height="6" rx="3" fill="#0891B2" opacity="0.7" />
          </g>
        ))}
        <path d="M12 116 C 60 112, 110 100, 160 92 C 200 86, 228 80, 248 74"
          fill="none" stroke="#0E7490" strokeWidth="1.8" strokeLinecap="round" />
        <text x="12" y="88" fontSize="7.5" fill="var(--c-muted)" fontFamily="'Geist', sans-serif">growth · illustrative</text>
      </svg>
    </div>
  );
}

function PvWatchlist() {
  return (
    <div style={pvWrap} aria-hidden>
      <svg viewBox="0 0 260 132" width="100%" style={{ display: "block" }}>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x="12" y={14 + i * 38} width="236" height="30" rx="8" fill="var(--c-panel)" stroke="var(--c-line)" strokeWidth="0.8" />
            <path d={`M26 ${22 + i * 38}l2.1 4.3 4.7.6-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.6z`}
              fill={i === 0 ? "#0E7490" : "none"} stroke="#0E7490" strokeWidth="1" strokeLinejoin="round" transform="scale(0.9)" transform-origin={`26 ${28 + i * 38}`} />
            <rect x="44" y={24 + i * 38} width="30" height="8" rx="4" fill="#0E7490" opacity="0.8" />
            <text x="84" y={31.5 + i * 38} fontSize="7.5" fill="var(--c-dim)" fontFamily="'Geist', sans-serif">{["US Large Blend", "Intermediate Bond", "Emerging Markets"][i]}</text>
            <circle cx="222" cy={29 + i * 38} r="1.6" fill="var(--c-muted)" /><circle cx="228" cy={29 + i * 38} r="1.6" fill="var(--c-muted)" /><circle cx="234" cy={29 + i * 38} r="1.6" fill="var(--c-muted)" />
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── Launchpad tool panel — preview + copy + one primary action ────────────────
export function ToolPanel({ name, desc, points, action, onAction, preview, wide, flip }: {
  name: string; desc: string; points: string[]; action: string; onAction: () => void;
  preview: React.ReactNode; wide?: boolean; flip?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: T.panel, border: `1px solid ${hover ? T.line2 : T.line}`, borderRadius: 16,
        boxShadow: hover ? "var(--elev-2)" : "var(--c-card-shadow)", padding: wide ? "26px 28px" : "22px 22px 20px",
        display: "flex", flexDirection: wide ? (flip ? "row-reverse" : "row") : "column",
        gap: wide ? 28 : 16, alignItems: wide ? "center" : "stretch", flexWrap: "wrap",
        transition: "box-shadow 0.18s, border-color 0.18s", minWidth: 0 }}>
      <div style={{ flex: wide ? "0 1 340px" : undefined, minWidth: wide ? 260 : undefined, width: wide ? undefined : "100%" }}>
        {preview}
      </div>
      <div style={{ flex: wide ? "1 1 320px" : 1, minWidth: wide ? 260 : 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: wide ? 19 : 16.5, fontWeight: 700, color: T.text, ...ui }}>{name}</div>
        <p style={{ fontSize: 13, color: T.dim, ...ui, lineHeight: 1.6, margin: 0 }}>{desc}</p>
        <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
          {points.map((pt) => <li key={pt} style={{ fontSize: 12, color: T.muted, ...ui, lineHeight: 1.5 }}>{pt}</li>)}
        </ul>
        <div style={{ marginTop: 4 }}>
          <button onClick={onAction}
            style={{ padding: "10px 17px", borderRadius: 9, border: "none", cursor: "pointer",
              background: T.blue, color: "#fff", fontSize: 13, fontWeight: 600, ...ui, transition: "background 0.15s" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = T.blueD)}
            onMouseLeave={(e) => (e.currentTarget.style.background = T.blue)}>
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResearchHubTab({ go, onAnalyze }: { go: (d: HubDest) => void; onAnalyze?: (t: string) => void }) {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const focusSearch = () => { searchRef.current?.focus(); searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); };

  const headerLink = (label: string, icon: string, dest: HubDest) => (
    <button key={label} onClick={() => go(dest)}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 13px", borderRadius: 9,
        background: T.panel, border: `1px solid ${T.line}`, cursor: "pointer",
        fontSize: 12.5, fontWeight: 600, color: T.dim, ...ui, transition: "all 0.15s" }}
      onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.line2; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = T.dim; e.currentTarget.style.borderColor = T.line; }}>
      <span style={{ display: "flex", color: T.muted }}>{ICONS[icon]}</span>
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1280, margin: "0 auto" }}>

      {/* ── 1 · Workspace header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.02em" }}>
            Research Workspace
          </h1>
          <p style={{ fontSize: 14, color: T.dim, ...ui, margin: "7px 0 0" }}>
            Find, evaluate, compare, and organize investments.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {headerLink("Watchlist", "watchlist", "watchlist")}
          {headerLink("Compare Funds", "compare", "compare")}
        </div>
      </div>

      {/* ── 2 · Universal investment search ── */}
      <UniversalSearch go={go} onAnalyze={onAnalyze} inputRef={searchRef} />

      {/* ── Section 1 · Find Investments ── */}
      <div style={section}>
        <SecLabel>Find Investments</SecLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <ToolPanel name="Screen Funds"
            desc="Filter the full fund universe using style, category, expenses, risk, performance, and investment characteristics."
            points={["Equity style box & fixed-income matrix", "16+ metrics with factor weighting", "Ranked composite results"]}
            action="Open Screen Funds" onAction={() => go("discover")} preview={<PvScreen />} />
          <ToolPanel name="Find Similar Funds"
            desc="Start with an existing investment and identify comparable or potentially better-fitting alternatives."
            points={["Top-fit alternatives to any ticker", "Lower-cost & better-fit candidates", "Owns all replacement searches"]}
            action="Find Similar Funds" onAction={() => go("replacements")} preview={<PvSimilar />} />
          <ToolPanel name="Match Client Profile"
            desc="Rank investments using the client's risk tolerance, time horizon, income needs, cost sensitivity, asset class, and vehicle preferences."
            points={["Risk, horizon, income & cost inputs", "Ranked matches with reasoning", "One click to Compare or Analyze"]}
            action="Match Client Profile" onAction={() => go("clientmatch")} preview={<PvClient />} />
        </div>
      </div>

      {/* ── Section 2 · Evaluate Investments ── */}
      <div style={section}>
        <SecLabel>Evaluate Investments</SecLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ToolPanel wide name="Compare Funds"
            desc="Compare selected investments side by side across performance, expenses, risk, holdings, strategy, and portfolio characteristics."
            points={["Up to 6 funds head-to-head", "Category-relative percentiles", "Cumulative return vs. benchmark"]}
            action="Compare Funds" onAction={() => go("compare")} preview={<PvCompare />} />
          <ToolPanel wide flip name="Analyze Fund"
            desc="Open the complete research profile for one investment, including performance, risk, expenses, holdings, and investment characteristics."
            points={["Full KPI set with plain-English verdict", "Risk, capture & drawdown detail", "Jump straight to similar funds"]}
            action="Analyze Fund" onAction={() => go("analysis")} preview={<PvAnalyze />} />
        </div>
      </div>

      {/* ── Section 3 · Organize and Review ── */}
      <div style={section}>
        <SecLabel>Organize and Review</SecLabel>
        <ToolPanel wide name="Watchlist"
          desc="Save investment candidates, organize research, and return to funds later."
          points={["Saved candidates with categories", "Add straight into a comparison", "Run a similar-funds search from any row"]}
          action="Open Watchlist" onAction={() => go("watchlist")} preview={<PvWatchlist />} />
      </div>

      {/* ── 5 · Continue Your Work ── */}
      <div style={section}>
        <SecLabel>Continue Your Work</SecLabel>
        <div style={{ background: T.panel, border: `1px dashed ${T.line2}`, borderRadius: 14,
          padding: "26px 26px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: T.blueL,
            border: `1px solid ${T.blue}33`, color: T.blue,
            display: "flex", alignItems: "center", justifyContent: "center" }}>{ICONS.analysis}</span>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, ...ui }}>Your research trail starts here</div>
            <div style={{ fontSize: 12.5, color: T.dim, ...ui, marginTop: 4, lineHeight: 1.55, maxWidth: 620 }}>
              Recently viewed funds, comparisons, and watchlist additions will appear here once you begin
              researching — so you can pick up exactly where you left off.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => go("discover")}
              style={{ padding: "9px 16px", borderRadius: 9, border: "none", cursor: "pointer",
                background: T.blue, color: "#fff", fontSize: 12.5, fontWeight: 600, ...ui }}>
              Screen Funds
            </button>
            <button onClick={() => go("watchlist")}
              style={{ padding: "9px 15px", borderRadius: 9, cursor: "pointer", background: T.panel,
                border: `1px solid ${T.line2}`, color: T.dim, fontSize: 12.5, fontWeight: 600, ...ui }}>
              Open Watchlist
            </button>
          </div>
        </div>
      </div>

      {/* ── 6 · Research Opportunities ── */}
      <div style={section}>
        <SecLabel>Research Opportunities</SecLabel>
        <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14,
          boxShadow: "var(--c-card-shadow)", padding: "22px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", color: T.blue }}>{ICONS.replace}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.text, ...ui }}>Replacement &amp; review candidates</span>
          </div>
          <p style={{ fontSize: 12.5, color: T.dim, ...ui, lineHeight: 1.6, margin: "10px 0 0", maxWidth: 720 }}>
            No findings yet. As you research and track funds, this feed will surface high-expense holdings,
            funds that deserve a second look, and portfolio-derived research opportunities.
          </p>
        </div>
      </div>

      <div style={{ fontSize: 12, color: T.muted, ...ui }}>
        Typical flow: <b style={{ color: T.dim }}>Find funds → Compare Funds → Analyze Fund → save to Watchlist or use in a recommendation.</b>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Portfolio Workspace — a light institutional portfolio workstation.
//  Reuses the existing destinations (build → recommendation builder,
//  improve → portfolio review, portfolios → client portfolios) and the real
//  saved-client data from lib/client. No duplicated portfolio logic.
// ════════════════════════════════════════════════════════════════════════════

/** Portfolio / client search — typeahead over real saved client profiles. */
function PortfolioSearch({ go, clients }: { go: (d: HubDest) => void; clients: Client[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return clients.filter((c) => (c.name || "").toLowerCase().includes(s)).slice(0, 6);
  }, [q, clients]);
  return (
    <div style={{ position: "relative" }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 380px", minWidth: 0 }}>
          <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: T.muted, display: "flex" }}>
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" />
              <line x1="10.6" y1="10.6" x2="14.2" y2="14.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => q.trim() && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); go(matches.length ? "portfolios" : "build"); setOpen(false); }
              else if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Search clients or portfolios"
            aria-label="Search clients or portfolios"
            style={{ width: "100%", boxSizing: "border-box", padding: "15px 16px 15px 44px",
              background: T.panel, border: `1px solid ${T.line2}`, borderRadius: 12,
              fontSize: 15, color: T.text, outline: "none", ...ui,
              boxShadow: "var(--elev-1)", transition: "border-color 0.15s" }} />
        </div>
        <button onClick={() => go("build")}
          style={{ padding: "0 24px", borderRadius: 12, border: "none", cursor: "pointer",
            background: T.blue, color: "#fff", fontSize: 14.5, fontWeight: 600, ...ui, transition: "background 0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = T.blueD)}
          onMouseLeave={(e) => (e.currentTarget.style.background = T.blue)}>
          New Portfolio
        </button>
        <button onClick={() => go("portfolios")}
          style={{ padding: "0 20px", borderRadius: 12, cursor: "pointer",
            background: T.panel, border: `1px solid ${T.line2}`, color: T.dim,
            fontSize: 14, fontWeight: 600, ...ui, transition: "all 0.15s" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.muted; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.dim; e.currentTarget.style.borderColor = T.line2; }}>
          Open Portfolio
        </button>
      </div>
      {open && q.trim() && (
        <div role="listbox" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 30,
          background: T.panel, border: `1px solid ${T.line2}`, borderRadius: 12, overflow: "hidden",
          boxShadow: "var(--elev-3)" }}>
          {matches.map((c, i) => (
            <button key={c.id} role="option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { go("portfolios"); setOpen(false); setQ(""); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 16px",
                border: "none", cursor: "pointer", textAlign: "left", background: "transparent",
                borderBottom: i < matches.length - 1 ? `1px solid ${T.line}` : "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.blueL)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: T.panel3,
                border: `1px solid ${T.line2}`, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11.5, fontWeight: 700, color: T.dim, ...ui }}>
                {(c.name || "?").trim().charAt(0).toUpperCase() || "?"}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: T.text, ...ui,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || "Untitled client"}</span>
              <span style={{ fontSize: 11, color: T.muted, ...ui, flexShrink: 0 }}>{riskLabel(c.risk)}</span>
            </button>
          ))}
          {matches.length === 0 && (
            <div style={{ padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: T.muted, ...ui }}>No saved portfolios match “{q.trim()}”.</span>
              <button onClick={() => { go("build"); setOpen(false); }}
                style={{ fontSize: 12, fontWeight: 600, color: T.blue, background: "none", border: "none",
                  cursor: "pointer", ...ui, whiteSpace: "nowrap" }}>
                Start a new one →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Portfolio subnavigation — only destinations that exist today. */
function PortfolioSubnav({ go }: { go: (d: HubDest) => void }) {
  const items: [string, HubDest | null][] = [
    ["Overview", null], ["Build", "build"], ["Review", "improve"], ["Compare", "portfolios"], ["Saved Portfolios", "portfolios"],
  ];
  return (
    <div role="navigation" aria-label="Portfolio sections"
      style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.line}`, overflowX: "auto" }}>
      {items.map(([label, dest]) => {
        const active = dest === null;
        return (
          <button key={label} onClick={() => dest && go(dest)} aria-current={active ? "page" : undefined}
            style={{ padding: "11px 16px 12px", border: "none", cursor: active ? "default" : "pointer",
              background: "transparent", whiteSpace: "nowrap",
              fontSize: 13.5, fontWeight: active ? 600 : 500, color: active ? T.blue : T.dim, ...ui,
              borderBottom: `2px solid ${active ? T.blue : "transparent"}`, marginBottom: -1,
              transition: "color 0.14s" }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = T.dim; }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Portfolio launchpad previews ─────────────────────────────────────────────
function PvBuild() {
  return (
    <div style={pvWrap} aria-hidden>
      <svg viewBox="0 0 260 132" width="100%" style={{ display: "block" }}>
        {(["Risk tolerance", "US / International", "Equity / Fixed"] as const).map((l, i) => (
          <g key={l}>
            <text x="12" y={24 + i * 26} fontSize="8" fill="var(--c-muted)" fontFamily="'Geist', sans-serif">{l}</text>
            <rect x="96" y={18 + i * 26} width="120" height="5" rx="2.5" fill="var(--c-panel3)" />
            <rect x="96" y={18 + i * 26} width={[78, 92, 60][i]} height="5" rx="2.5" fill="#0E7490" opacity="0.8" />
            <circle cx={96 + [78, 92, 60][i]} cy={20.5 + i * 26} r="5" fill="var(--c-panel)" stroke="#0E7490" strokeWidth="1.4" />
          </g>
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={12 + i * 30} y="98" width="24" height="6" rx="3"
            fill={i < 3 ? "#0E7490" : "var(--c-panel3)"} opacity={i < 3 ? 0.85 : 1} />
        ))}
        <text x="170" y="105" fontSize="7.5" fill="var(--c-muted)" fontFamily="'Geist', sans-serif">Step 3 of 5</text>
      </svg>
    </div>
  );
}
function PvReviewPort() {
  return (
    <div style={pvWrap} aria-hidden>
      <svg viewBox="0 0 260 132" width="100%" style={{ display: "block" }}>
        {[["US Equity", 96, "#0E7490"], ["Intl Equity", 62, "#0891B2"], ["Fixed Income", 46, "#155E75"]].map(([l, w, c], i) => (
          <g key={l as string}>
            <text x="12" y={24 + i * 24} fontSize="8" fill="var(--c-muted)" fontFamily="'Geist', sans-serif">{l}</text>
            <rect x="78" y={17 + i * 24} width="120" height="8" rx="4" fill="var(--c-panel3)" />
            <rect x="78" y={17 + i * 24} width={w as number} height="8" rx="4" fill={c as string} opacity="0.85" />
          </g>
        ))}
        <rect x="12" y="94" width="112" height="24" rx="7" fill="var(--c-blueL)" stroke="#0E749033" strokeWidth="0.8" />
        <text x="20" y="109" fontSize="8" fill="#0E7490" fontFamily="'Geist', sans-serif">Weighted expense 0.08%</text>
        <rect x="134" y="94" width="114" height="24" rx="7" fill="rgba(180,83,9,0.07)" stroke="rgba(180,83,9,0.3)" strokeWidth="0.8" />
        <text x="142" y="109" fontSize="8" fill="var(--c-amber, #B45309)" fontFamily="'Geist', sans-serif">Overlap flag · 2 funds</text>
      </svg>
    </div>
  );
}
function PvComparePort() {
  return (
    <div style={pvWrap} aria-hidden>
      <svg viewBox="0 0 260 132" width="100%" style={{ display: "block" }}>
        {["Current", "Proposed"].map((label, k) => (
          <g key={label} transform={`translate(${16 + k * 126}, 14)`}>
            <text y="8" fontSize="8.5" fontWeight="600" fill={k === 1 ? "#0E7490" : "var(--c-dim)"} fontFamily="'Geist', sans-serif">{label}</text>
            {(k === 0 ? [88, 42, 24] : [62, 48, 44]).map((w, j) => (
              <rect key={j} y={16 + j * 14} width={w} height="8" rx="4"
                fill={k === 1 ? ["#0E7490", "#0891B2", "#155E75"][j] : "var(--c-muted)"} opacity={k === 1 ? 0.85 : 0.35} />
            ))}
          </g>
        ))}
        <line x1="130" y1="12" x2="130" y2="76" stroke="var(--c-line2)" strokeWidth="1" strokeDasharray="3 3" />
        <text x="16" y="104" fontSize="8" fill="var(--c-dim)" fontFamily="'Geist', sans-serif">Expense −0.25%</text>
        <text x="100" y="104" fontSize="8" fill="var(--c-dim)" fontFamily="'Geist', sans-serif">Risk −1 level</text>
        <text x="182" y="104" fontSize="8" fill="var(--c-dim)" fontFamily="'Geist', sans-serif">6 weight changes</text>
      </svg>
    </div>
  );
}

/** Functional Build → Review → Compare → Model workflow — availability is
    driven by real saved-portfolio state, completed/available stages navigate. */
function WorkflowStages({ clients, go }: { clients: Client[]; go: (d: HubDest) => void }) {
  const hasPortfolio = clients.length > 0;
  const hasCurrent = clients.some((c) => c.holdings.length > 0);
  const stages: { label: string; dest: HubDest; enabled: boolean; done: boolean }[] = [
    { label: "Build", dest: "build", enabled: true, done: hasPortfolio },
    { label: "Review", dest: "improve", enabled: hasPortfolio, done: false },
    { label: "Compare", dest: "portfolios", enabled: hasCurrent, done: false },
    { label: "Model", dest: "model", enabled: hasPortfolio, done: false },
  ];
  return (
    <div role="navigation" aria-label="Portfolio workflow"
      style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {stages.map((st, i) => (
        <React.Fragment key={st.label}>
          <button onClick={() => st.enabled && go(st.dest)} disabled={!st.enabled}
            title={st.enabled ? `Open ${st.label}` : `${st.label} unlocks once a portfolio exists`}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 8,
              border: `1px solid ${st.done ? "#0E749044" : T.line}`, cursor: st.enabled ? "pointer" : "default",
              background: st.done ? T.blueL : T.panel, fontSize: 11.5, fontWeight: 600, ...ui,
              color: st.enabled ? (st.done ? T.blue : T.dim) : T.muted, opacity: st.enabled ? 1 : 0.55 }}>
            {st.done && <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            {st.label}
          </button>
          {i < stages.length - 1 && <span style={{ fontSize: 10, color: T.line2 }}>→</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

/** Dark analytical preview — the one deliberately charcoal panel on the page. */
function AnalyticsPreview({ go }: { go: (d: HubDest) => void }) {
  const R = 34, C = 2 * Math.PI * R;
  const segs = [[0.4, "#5EEAD4"], [0.26, "#38BDF8"], [0.2, "#0E7490"], [0.14, "rgba(255,255,255,0.22)"]] as [number, string][];
  let acc = 0;
  return (
    <div style={{ background: "linear-gradient(150deg, #101216 0%, #15171C 100%)", border: "1px solid #26262B",
      borderRadius: 14, padding: "22px 24px", boxShadow: "var(--elev-2), inset 0 1px 0 rgba(255,255,255,0.05)",
      display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
      <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden style={{ flexShrink: 0 }}>
        <g transform="translate(46,46)">
          {segs.map(([f, c], i) => {
            const el = <circle key={i} r={R} fill="none" stroke={c} strokeWidth="11"
              strokeDasharray={`${f * C} ${C - f * C}`} strokeDashoffset={-acc * C} transform="rotate(-90)" opacity="0.9" />;
            acc += f; return el;
          })}
          <text textAnchor="middle" y="4" fontSize="9" fontWeight="700" fill="rgba(244,245,247,0.85)"
            fontFamily="'Geist', sans-serif" letterSpacing="0.5">MIX</text>
        </g>
      </svg>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#F4F5F7", ...ui }}>Analytics preview</div>
        <p style={{ fontSize: 12.5, color: "rgba(244,245,247,0.66)", ...ui, lineHeight: 1.6, margin: "8px 0 0", maxWidth: 560 }}>
          Open a portfolio to see its full analytics — asset allocation, diversification, expenses,
          risk level, and how the current mix compares with your proposal.
        </p>
      </div>
      <button onClick={() => go("improve")}
        style={{ padding: "10px 18px", borderRadius: 10, cursor: "pointer", flexShrink: 0,
          background: "rgba(94,234,212,0.1)", border: "1px solid rgba(94,234,212,0.32)",
          color: "#5EEAD4", fontSize: 12.5, fontWeight: 600, ...ui, transition: "background 0.15s" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(94,234,212,0.16)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(94,234,212,0.1)")}>
        Open Portfolio Review →
      </button>
    </div>
  );
}

export function AdvisorWorkspaceTab({ go }: { go: (d: HubDest) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  useEffect(() => { setClients(loadClients()); }, []);

  const diagnostics = ["High expense exposure", "Fund overlap", "Concentration risk", "Allocation imbalance", "Replacement opportunities"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1280, margin: "0 auto" }}>

      {/* ── 1 · Workspace header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.02em" }}>
            Portfolio Workspace
          </h1>
          <p style={{ fontSize: 14, color: T.dim, ...ui, margin: "7px 0 0" }}>
            Build, review, and refine complete client portfolios.
          </p>
        </div>
        <WorkflowStages clients={clients} go={go} />
      </div>

      {/* ── 2 · Portfolio search / selector ── */}
      <PortfolioSearch go={go} clients={clients} />

      {/* ── 3 · Portfolio subnavigation ── */}
      <PortfolioSubnav go={go} />

      {/* ── 4 · Primary workflow panels (launchpad with previews) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <ToolPanel name="Build Portfolio"
          desc="Create a target portfolio using client objectives, risk profile, allocation preferences, tax considerations, and selected investments."
          points={["Guided 5-step builder", "Risk, allocation & tax controls", "Data-driven fund selection"]}
          action="Build Portfolio" onAction={() => go("build")} preview={<PvBuild />} />
        <ToolPanel name="Review Portfolio"
          desc="Evaluate a portfolio's allocation, expenses, diversification, overlap, concentration, risk, and underlying exposures."
          points={["Allocation & expense summary", "Diagnostic flags", "Holding-level review"]}
          action="Review Portfolio" onAction={() => go("improve")} preview={<PvReviewPort />} />
        <ToolPanel name="Compare Portfolios"
          desc="Compare an existing portfolio with a proposed portfolio and identify what changed."
          points={["Current vs. proposed side by side", "Weight, expense & risk deltas", "Continue into Model"]}
          action="Compare Portfolios" onAction={() => go("portfolios")} preview={<PvComparePort />} />
      </div>

      {/* ── 5 · Recent Portfolios (real saved clients) ── */}
      <div style={section}>
        <SecLabel>Recent Portfolios</SecLabel>
        {clients.length === 0 ? (
          <div style={{ background: T.panel, border: `1px dashed ${T.line2}`, borderRadius: 14,
            padding: "26px 26px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: T.blueL,
              border: `1px solid ${T.blue}33`, color: T.blue,
              display: "flex", alignItems: "center", justifyContent: "center" }}>{ICONS.portfolios}</span>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, ...ui }}>No saved portfolios yet</div>
              <div style={{ fontSize: 12.5, color: T.dim, ...ui, marginTop: 4, lineHeight: 1.55 }}>
                Portfolios you build will appear here with their client profile, so you can reopen and refine them.
              </div>
            </div>
            <button onClick={() => go("build")}
              style={{ padding: "9px 16px", borderRadius: 9, border: "none", cursor: "pointer",
                background: T.blue, color: "#fff", fontSize: 12.5, fontWeight: 600, ...ui }}>
              New Portfolio
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
            {clients.slice(0, 8).map((c) => (
              <button key={c.id} onClick={() => go("portfolios")}
                style={{ textAlign: "left", cursor: "pointer", background: T.panel,
                  border: `1px solid ${T.line}`, borderRadius: 12, padding: "14px 16px",
                  boxShadow: "var(--c-card-shadow)", display: "flex", alignItems: "center", gap: 12,
                  transition: "border-color 0.15s, box-shadow 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.line2; e.currentTarget.style.boxShadow = "var(--elev-2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.boxShadow = "var(--c-card-shadow)"; }}>
                <span style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: T.blueL,
                  border: `1px solid ${T.blue}33`, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, color: T.blue, ...ui }}>
                  {(c.name || "?").trim().charAt(0).toUpperCase() || "?"}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: T.text, ...ui,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name || "Untitled client"}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: T.muted, ...ui, marginTop: 2 }}>{riskLabel(c.risk)}</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.blue, ...ui, flexShrink: 0 }}>Open →</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 6 · Portfolio Diagnostics ── */}
      <div style={section}>
        <SecLabel>Portfolio Diagnostics</SecLabel>
        <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14,
          boxShadow: "var(--c-card-shadow)", padding: "22px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", color: T.blue }}>{ICONS.opportunity}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.text, ...ui }}>What the review checks</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
            {diagnostics.map((d) => (
              <span key={d} style={{ fontSize: 11.5, fontWeight: 600, color: T.dim, ...ui,
                background: T.panel3, border: `1px solid ${T.line}`, borderRadius: 99, padding: "6px 12px" }}>{d}</span>
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: T.muted, ...ui, lineHeight: 1.6, margin: "14px 0 0" }}>
            Diagnostics appear after a portfolio is opened — no findings are shown until real portfolio data has been analyzed.
          </p>
        </div>
      </div>

      {/* ── 7 · Analytical preview (selective dark panel) ── */}
      <AnalyticsPreview go={go} />

      {/* ── 8 · Planning tools ── */}
      <div style={section}>
        <SecLabel>Planning</SecLabel>
        <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14,
          boxShadow: "var(--c-card-shadow)", padding: "22px 26px",
          display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: T.blueL,
            border: `1px solid ${T.blue}33`, color: T.blue,
            display: "flex", alignItems: "center", justifyContent: "center" }}>{ICONS.build}</span>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, ...ui }}>Retirement &amp; income planning</div>
            <div style={{ fontSize: 12.5, color: T.dim, ...ui, marginTop: 4, lineHeight: 1.55, maxWidth: 620 }}>
              Projections, withdrawal analysis, and sustainability checks are part of the recommendation
              builder — they stay connected to the portfolio you're working on.
            </div>
          </div>
          <button onClick={() => go("build")}
            style={{ padding: "9px 16px", borderRadius: 9, cursor: "pointer",
              background: T.blueL, border: `1px solid ${T.blue}44`, color: T.blue,
              fontSize: 12.5, fontWeight: 600, ...ui }}>
            Open Portfolio Builder →
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: T.muted, ...ui }}>
        Typical flow: <b style={{ color: T.dim }}>Build → Analyze → Refine → Compare → Model.</b>
      </div>
    </div>
  );
}
