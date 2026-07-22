"use client";
import React, { useEffect, useState } from "react";
import { T, ui } from "./tokens";
import { takeModelHandoff, HANDOFF_EVENT, type ModelHandoff } from "../lib/handoff";
import { loadScenarios, type SavedScenario } from "../lib/model";
import { Notice } from "./model/shared";
import { ModelOverview } from "./model/ModelOverview";
import { FundBenchmark } from "./model/FundBenchmark";
import { PortfolioProjection } from "./model/PortfolioProjection";
import { CompareScenarios } from "./model/CompareScenarios";
import { StressTest } from "./model/StressTest";
import { SavedList } from "./model/SavedScenarios";

// ════════════════════════════════════════════════════════════════════════════
//  Model — advisor-only scenario analysis workspace shell.
//  Deterministic, transparent projections. Everything is labeled illustrative;
//  nothing is presented as a forecast or guarantee. The individual workflows
//  live in ./model/*; this file owns the header, sub-navigation, and routing.
// ════════════════════════════════════════════════════════════════════════════

export type ModelMode = "overview" | "fund-benchmark" | "projection" | "scenarios" | "stress" | "saved";

const MODES: [ModelMode, string][] = [
  ["overview", "Overview"], ["fund-benchmark", "Fund vs. Benchmark"], ["projection", "Portfolio Projection"],
  ["scenarios", "Compare Scenarios"], ["stress", "Stress Test"], ["saved", "Saved Scenarios"],
];

// The global TopNav is a fixed floating bar: 60px tall + 14px top padding on
// desktop (10px on small screens). The Model subnav sticks just below it so
// section navigation never disappears — and content never renders beneath it.
const SUBNAV_STICKY_TOP = 78;

export default function ModelTab({ mode, setMode, onReturnToPortfolio }: {
  mode: ModelMode; setMode: (m: ModelMode) => void; onReturnToPortfolio?: () => void;
}) {
  const [prefill, setPrefill] = useState<SavedScenario | null>(null);
  const [handoff, setHandoff] = useState<ModelHandoff | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  useEffect(() => { setSavedCount(loadScenarios().length); }, [mode]);

  // Consume a Portfolio → Model handoff (read-once): one portfolio opens the
  // projection tool; current + proposed open scenario comparison.
  useEffect(() => {
    const consume = () => {
      const h = takeModelHandoff();
      if (!h) return;
      setHandoff(h);
      setMode(h.second ? "scenarios" : "projection");
    };
    consume(); // handoff set before Model first mounted
    window.addEventListener(HANDOFF_EVENT, consume); // handoff set while mounted
    return () => window.removeEventListener(HANDOFF_EVENT, consume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (m: ModelMode) => {
    setMode(m);
    // Account for the fixed header: land at the top of the Model content, not
    // mid-scroll with the new section's heading hidden under the nav.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
  };
  const resume = (s: SavedScenario) => { setPrefill(s); go(s.tool); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1280, margin: "0 auto" }}>
      {/* header */}
      <div>
        <h1 style={{ fontSize: 27, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.02em" }}>Model</h1>
        <p style={{ fontSize: 14, color: T.dim, ...ui, margin: "7px 0 0" }}>
          Test funds and portfolios across benchmarks, assumptions, and market scenarios.
        </p>
        <div style={{ marginTop: 12 }}><Notice /></div>
      </div>

      {/* subnav — sticky below the fixed global nav, solid background so
          content never shows through while scrolling */}
      <div style={{ position: "sticky", top: SUBNAV_STICKY_TOP, zIndex: 40, background: "var(--c-bg)",
        margin: "0 -8px", padding: "4px 8px 0" }}>
        <style>{`.alca-model-subnav::-webkit-scrollbar{display:none}`}</style>
        <div className="alca-model-subnav" role="navigation" aria-label="Model sections"
          style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.line}`, overflowX: "auto", scrollbarWidth: "none" }}>
          {MODES.map(([m, label]) => {
            const active = m === mode;
            return (
              <button key={m} onClick={() => go(m)} aria-current={active ? "page" : undefined}
                style={{ padding: "11px 15px 12px", border: "none", cursor: active ? "default" : "pointer",
                  background: "transparent", whiteSpace: "nowrap", fontSize: 13.5, fontWeight: active ? 600 : 500,
                  color: active ? T.blue : T.dim, ...ui, borderBottom: `2px solid ${active ? T.blue : "transparent"}`,
                  marginBottom: -1, transition: "color 0.14s" }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = T.text; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = T.dim; }}>
                {label}{m === "saved" && savedCount > 0 ? ` (${savedCount})` : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* body */}
      {mode === "overview" && <ModelOverview setMode={go} onResume={resume} />}
      {mode === "fund-benchmark" && <FundBenchmark prefill={prefill?.tool === "fund-benchmark" ? prefill : null} />}
      {mode === "projection" && (
        <PortfolioProjection prefill={prefill?.tool === "projection" ? prefill : null}
          handoff={handoff && !handoff.second ? handoff : null} onReturnToPortfolio={onReturnToPortfolio} />
      )}
      {mode === "scenarios" && <CompareScenarios seed={handoff?.second ? handoff : null} onReturnToPortfolio={onReturnToPortfolio} />}
      {mode === "stress" && <StressTest />}
      {mode === "saved" && <SavedList onResume={resume} />}
    </div>
  );
}
