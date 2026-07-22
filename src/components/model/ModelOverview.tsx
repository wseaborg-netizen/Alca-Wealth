"use client";
import React from "react";
import { T, ui } from "../tokens";
import { ToolPanel, pvWrap } from "../Hubs";
import type { SavedScenario } from "../../lib/model";
import { SavedList } from "./SavedScenarios";
import type { ModelMode } from "../ModelTab";

// ── Static previews — miniature, clearly illustrative interfaces (no fake
//    live results; same visual system as the Research/Portfolio hubs) ─────────

const TEAL = "#0E7490";

function PvFundBench() {
  return (
    <div style={pvWrap} aria-hidden>
      <svg viewBox="0 0 260 132" width="100%" style={{ display: "block" }}>
        {/* two ticker fields */}
        <rect x="12" y="12" width="60" height="20" rx="6" fill="var(--c-panel)" stroke="var(--c-line2)" strokeWidth="0.9" />
        <text x="42" y="25.5" textAnchor="middle" fontSize="9" fontWeight="700" fill={TEAL} fontFamily="'Geist Mono', monospace">VTI</text>
        <text x="84" y="25.5" textAnchor="middle" fontSize="9" fill="var(--c-muted)" fontFamily="'Geist', sans-serif">vs</text>
        <rect x="96" y="12" width="60" height="20" rx="6" fill="var(--c-panel)" stroke="var(--c-line2)" strokeWidth="0.9" />
        <text x="126" y="25.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#0891B2" fontFamily="'Geist Mono', monospace">SPY</text>
        {/* historical comparison lines */}
        <path d="M12 92 C 60 88, 120 72, 180 60 C 215 54, 235 50, 248 47"
          fill="none" stroke={TEAL} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 92 C 60 90, 120 78, 180 68 C 215 62, 235 58, 248 56"
          fill="none" stroke="#0891B2" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="4 3" />
        <text x="12" y="110" fontSize="7.5" fill="var(--c-muted)" fontFamily="'Geist', sans-serif">growth of $10,000 · historical</text>
        {/* metric chips */}
        {["Return", "Volatility", "Drawdown"].map((l, i) => (
          <g key={l}>
            <rect x={168 + 0} y={12 + i * 15} width="80" height="12" rx="6" fill="var(--c-blueL)" opacity={1 - i * 0.18} />
            <text x={176} y={21 + i * 15} fontSize="7" fill={TEAL} fontFamily="'Geist', sans-serif">{l}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function PvProjection() {
  return (
    <div style={pvWrap} aria-hidden>
      <svg viewBox="0 0 260 132" width="100%" style={{ display: "block" }}>
        {/* mini allocation bars */}
        {[["US Equity", 66], ["Intl Equity", 44], ["Fixed Income", 30]].map(([l, w], i) => (
          <g key={l as string}>
            <text x="12" y={20 + i * 16} fontSize="7.5" fill="var(--c-muted)" fontFamily="'Geist', sans-serif">{l}</text>
            <rect x="66" y={14 + i * 16} width="70" height="6" rx="3" fill="var(--c-panel3)" />
            <rect x="66" y={14 + i * 16} width={w as number} height="6" rx="3" fill={TEAL} opacity="0.8" />
          </g>
        ))}
        <text x="150" y="20" fontSize="7.5" fill="var(--c-dim)" fontFamily="'Geist', sans-serif">$250K start</text>
        <text x="150" y="34" fontSize="7.5" fill="var(--c-dim)" fontFamily="'Geist', sans-serif">20y horizon</text>
        {/* three assumption paths */}
        <path d="M12 112 C 70 106, 150 88, 248 58" fill="none" stroke="#38BDF8" strokeWidth="1.3" strokeDasharray="4 3" />
        <path d="M12 112 C 70 108, 150 96, 248 74" fill="none" stroke={TEAL} strokeWidth="1.8" />
        <path d="M12 112 C 70 110, 150 102, 248 90" fill="none" stroke="#B45309" strokeWidth="1.3" strokeDasharray="4 3" />
        <text x="196" y="120" fontSize="7" fill="var(--c-muted)" fontFamily="'Geist', sans-serif">3 assumption paths</text>
      </svg>
    </div>
  );
}

function PvScenarios() {
  return (
    <div style={pvWrap} aria-hidden>
      <svg viewBox="0 0 260 132" width="100%" style={{ display: "block" }}>
        {/* two named scenario chips */}
        <rect x="12" y="12" width="84" height="18" rx="9" fill="var(--c-blueL)" stroke={`${TEAL}44`} strokeWidth="0.9" />
        <circle cx="24" cy="21" r="3.5" fill={TEAL} />
        <text x="33" y="24.5" fontSize="7.5" fill="var(--c-text)" fontFamily="'Geist', sans-serif">Current</text>
        <rect x="102" y="12" width="92" height="18" rx="9" fill="var(--c-panel)" stroke="var(--c-line2)" strokeWidth="0.9" />
        <circle cx="114" cy="21" r="3.5" fill="#0891B2" />
        <text x="123" y="24.5" fontSize="7.5" fill="var(--c-dim)" fontFamily="'Geist', sans-serif">Proposed</text>
        {/* two-line comparison */}
        <path d="M12 104 C 80 98, 160 82, 248 62" fill="none" stroke={TEAL} strokeWidth="1.7" strokeLinecap="round" />
        <path d="M12 104 C 80 100, 160 90, 248 76" fill="none" stroke="#0891B2" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="5 3" />
        {/* assumption delta */}
        <rect x="150" y="36" width="98" height="14" rx="7" fill="var(--c-panel)" stroke="var(--c-line)" strokeWidth="0.8" />
        <text x="158" y="46" fontSize="7.5" fill="var(--c-dim)" fontFamily="'Geist', sans-serif">Base return +1.0 pt</text>
      </svg>
    </div>
  );
}

function PvStress() {
  return (
    <div style={pvWrap} aria-hidden>
      <svg viewBox="0 0 260 132" width="100%" style={{ display: "block" }}>
        {/* stress-event cards */}
        {["Market decline −30%", "Higher inflation +2 pt"].map((l, i) => (
          <g key={l}>
            <rect x="12" y={12 + i * 22} width="128" height="17" rx="6"
              fill={i === 0 ? "var(--c-blueL)" : "var(--c-panel)"} stroke={i === 0 ? `${TEAL}44` : "var(--c-line2)"} strokeWidth="0.9" />
            <text x="20" y={23.5 + i * 22} fontSize="7.5" fill={i === 0 ? TEAL : "var(--c-dim)"} fontFamily="'Geist', sans-serif">{l}</text>
          </g>
        ))}
        {/* base + stressed lines with event marker */}
        <line x1="60" y1="62" x2="60" y2="122" stroke="rgba(220,38,38,0.5)" strokeWidth="1" strokeDasharray="3 3" />
        <path d="M12 108 C 80 100, 170 84, 248 64" fill="none" stroke={TEAL} strokeWidth="1.7" strokeLinecap="round" />
        <path d="M12 108 L 60 112 C 70 118, 90 112, 130 104 C 180 95, 220 86, 248 80" fill="none" stroke="#B45309" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="5 3" />
        {/* ending diff */}
        <rect x="168" y="36" width="80" height="14" rx="7" fill="var(--c-panel)" stroke="var(--c-line)" strokeWidth="0.8" />
        <text x="176" y="46" fontSize="7.5" fill="var(--c-red, #DC2626)" fontFamily="'Geist', sans-serif">−$182K vs base</text>
      </svg>
    </div>
  );
}

// ── Workflow indicator — explains the natural order without forcing it ───────
function WorkflowStrip({ setMode }: { setMode: (m: ModelMode) => void }) {
  const steps: { label: string; mode: ModelMode }[] = [
    { label: "Compare", mode: "fund-benchmark" },
    { label: "Project", mode: "projection" },
    { label: "Test Alternatives", mode: "scenarios" },
    { label: "Stress Test", mode: "stress" },
  ];
  return (
    <div role="navigation" aria-label="Model workflow" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {steps.map((st, i) => (
        <React.Fragment key={st.label}>
          <button onClick={() => setMode(st.mode)} title={`Open ${st.label}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 8,
              border: `1px solid ${T.line}`, cursor: "pointer", background: T.panel,
              fontSize: 11.5, fontWeight: 600, ...ui, color: T.dim }}>
            {st.label}
          </button>
          {i < steps.length - 1 && <span style={{ fontSize: 10, color: T.line2 }} aria-hidden>→</span>}
        </React.Fragment>
      ))}
      <span style={{ fontSize: 11, color: T.muted, ...ui, marginLeft: 6 }}>
        a natural order — every tool also works on its own
      </span>
    </div>
  );
}

// ── Overview page ─────────────────────────────────────────────────────────────
export function ModelOverview({ setMode, onResume }: {
  setMode: (m: ModelMode) => void; onResume: (s: SavedScenario) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <p style={{ fontSize: 13.5, color: T.dim, ...ui, margin: 0, lineHeight: 1.6, maxWidth: 640 }}>
          Explore illustrative outcomes, compare alternative paths, and understand the tradeoffs between
          return, risk, income, and portfolio sustainability.
        </p>
        <WorkflowStrip setMode={setMode} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <ToolPanel name="Fund vs. Benchmark"
          desc="Compare one investment with a benchmark: real historical record side by side, then an illustrative projection under editable assumptions."
          points={["Historical return, volatility, drawdown & expenses", "Growth of $10,000 over the shared period", "Downside / Base / Upside projection paths"]}
          action="Compare Fund" onAction={() => setMode("fund-benchmark")} preview={<PvFundBench />} />
        <ToolPanel name="Portfolio Projection"
          desc="Model how a portfolio may evolve under explicit return, contribution, withdrawal, inflation, and expense assumptions."
          points={["Holdings with derived historical facts", "Three editable assumption paths", "Sustainability & depletion analysis"]}
          action="Project Portfolio" onAction={() => setMode("projection")} preview={<PvProjection />} />
        <ToolPanel name="Compare Scenarios"
          desc="Create alternative versions of a plan and see exactly which assumptions changed and how the modeled outcomes differ."
          points={["Up to 4 named scenarios side by side", "Difference summary — what changed, precisely", "Works with Current vs. Proposed portfolios"]}
          action="Build Scenarios" onAction={() => setMode("scenarios")} preview={<PvScenarios />} />
        <ToolPanel name="Stress Test"
          desc="Apply explicit adverse assumption changes — a market decline, higher inflation, lower returns — and measure the impact against the base plan."
          points={["Exact assumption change, timing & duration", "Event markers on the modeled chart", "Dollar and percentage impact vs. base"]}
          action="Run Stress Test" onAction={() => setMode("stress")} preview={<PvStress />} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11.5, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
          Recent &amp; saved modeling
        </div>
        <SavedList onResume={onResume} limit={5} />
      </div>

      <p style={{ fontSize: 11.5, color: T.muted, ...ui, margin: 0, lineHeight: 1.6 }}>
        All Model outputs are deterministic and assumption-driven — Downside, Base, and Upside are
        illustrative assumption paths, not probability bands or forecasts. Roadmap note: Monte Carlo
        simulation is planned but not part of today&apos;s tools.
      </p>
    </div>
  );
}
