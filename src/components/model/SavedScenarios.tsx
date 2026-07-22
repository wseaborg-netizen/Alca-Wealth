"use client";
import React, { useEffect, useState } from "react";
import { T, ui } from "../tokens";
import { loadScenarios, deleteScenario, type SavedScenario } from "../../lib/model";
import { Card } from "./shared";

const TOOL_LABEL: Record<SavedScenario["tool"], string> = {
  "fund-benchmark": "Fund vs. Benchmark",
  projection: "Portfolio Projection",
  scenarios: "Compare Scenarios",
  stress: "Stress Test",
};

/** Saved-scenario list — resume/delete on real localStorage data. */
export function SavedList({ onResume, limit }: { onResume: (s: SavedScenario) => void; limit?: number }) {
  const [list, setList] = useState<SavedScenario[]>([]);
  useEffect(() => { setList(loadScenarios()); }, []);
  if (!list.length) return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: T.blueL,
          border: `1px solid ${T.blue}33`, color: T.blue, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2.5h7.5L13 5v8.5H3v-11z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M5.5 8h5M5.5 10.5h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
        </span>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, ...ui }}>No saved modeling yet</div>
          <p style={{ fontSize: 12.5, color: T.dim, ...ui, margin: "4px 0 0", lineHeight: 1.55 }}>
            Saved fund comparisons, portfolio projections, and scenarios will appear here so you can resume the analysis later.
          </p>
        </div>
      </div>
    </Card>
  );
  const shown = limit ? list.slice(0, limit) : list;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {shown.map((s) => (
        <div key={s.id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
          background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 16px" }}>
          <span style={{ flex: 1, minWidth: 180 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: T.text, ...ui }}>{s.name}</span>
            <span style={{ display: "block", fontSize: 11.5, color: T.muted, ...ui, marginTop: 2 }}>
              {s.subject} · {s.assumptions.years}y horizon · saved {new Date(s.savedAt).toLocaleDateString()}
              {s.migrated ? " · updated to Downside/Base/Upside assumptions" : ""}
            </span>
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.dim, background: T.panel3, border: `1px solid ${T.line}`,
            borderRadius: 6, padding: "3px 8px", ...ui }}>{TOOL_LABEL[s.tool]}</span>
          <button onClick={() => onResume(s)}
            style={{ padding: "8px 14px", borderRadius: 9, border: "none", cursor: "pointer", background: T.blue,
              color: "#fff", fontSize: 12, fontWeight: 600, ...ui }}>Resume</button>
          <button onClick={() => setList(deleteScenario(s.id))} aria-label={`Delete ${s.name}`}
            style={{ padding: "8px 12px", borderRadius: 9, cursor: "pointer", background: T.panel,
              border: `1px solid ${T.line2}`, color: T.muted, fontSize: 12, fontWeight: 600, ...ui }}>Delete</button>
        </div>
      ))}
      {limit != null && list.length > shown.length && (
        <div style={{ fontSize: 11.5, color: T.muted, ...ui, padding: "2px 2px 0" }}>
          Showing {shown.length} of {list.length} saved items — open Saved Scenarios for the full list.
        </div>
      )}
    </div>
  );
}
