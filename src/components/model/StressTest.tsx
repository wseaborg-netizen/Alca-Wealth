"use client";
import React, { useState } from "react";
import { T, ui, mono } from "../tokens";
import {
  projectPaths, validateReturns, STRESS_PRESETS,
  fmtMoney, type ModelAssumptions, type StressPreset,
} from "../../lib/model";
import {
  Card, CardTitle, Field, ErrorList, StatTile, Methodology, PathReturnFields,
  DEFAULTS, PATH_COLORS,
} from "./shared";
import { ModelChart, pathLine, type ChartSeries, type ChartMarker } from "./ModelChart";

// ════════════════════════════════════════════════════════════════════════════
//  Stress Test — explicit adverse assumption changes measured against the
//  base plan. Each selected stress is applied SEPARATELY to the base
//  assumptions; stresses are not combined.
// ════════════════════════════════════════════════════════════════════════════

const STRESS_COLORS = ["#38BDF8", "#F5B04B", "#C084FC", "#FB7185", "#A3E635", "#9CA3AF"];

export function StressTest() {
  const [a, setA] = useState<ModelAssumptions>({ ...DEFAULTS, monthlyWithdrawal: 0 });
  const [active, setActive] = useState<string[]>(["decline"]);
  const [shockYear, setShockYear] = useState(1);

  const returnErrs = validateReturns(a);
  const baseA = { ...a, shockYear };
  // The engine is deterministic and cheap — recompute per render, no memo games.
  const base = returnErrs.length ? null : projectPaths(baseA);
  const stressed = base ? STRESS_PRESETS.filter((p) => active.includes(p.id))
    .map((p, i) => ({ p, r: projectPaths(p.apply(baseA)), color: STRESS_COLORS[i % STRESS_COLORS.length] })) : [];

  const declineOn = active.includes("decline");
  const markers: ChartMarker[] = [];
  if (base && declineOn) markers.push({ month: (Math.min(Math.max(1, shockYear), a.years) - 1) * 12, label: "−30% decline" });
  if (base && active.includes("lostdecade") && a.years > 10) markers.push({ month: 120, label: "normal assumptions resume" });

  const series: ChartSeries[] = base ? [
    { label: "Base Path (no stress)", points: pathLine(base, "base"), color: PATH_COLORS.base, width: 2.4 },
    ...stressed.filter(({ p }) => !p.riskMetricOnly).map(({ p, r, color }) => (
      { label: p.label, points: pathLine(r, "base"), color, dash: "6 4", width: 1.7 })),
  ] : [];

  const damaging = stressed.filter(({ p }) => !p.riskMetricOnly);
  const worst = base && damaging.length
    ? damaging.reduce((w, x) => (x.r.ending.base < w.r.ending.base ? x : w), damaging[0])
    : null;

  const sustainability = (r: { depletionMonth: { down?: number; base?: number; up?: number } }) => {
    if (r.depletionMonth.base) return { text: `Depletes ~yr ${Math.ceil(r.depletionMonth.base / 12)} (base path)`, bad: true };
    if (r.depletionMonth.down) return { text: `Downside path depletes ~yr ${Math.ceil(r.depletionMonth.down / 12)}`, bad: true };
    return { text: "Lasts horizon", bad: false };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* base plan assumptions */}
      <Card>
        <CardTitle sub="the plan every stress is measured against">Base plan assumptions</CardTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
          <Field label="Starting value ($)" value={a.initial} step={5000} min={0} onChange={(v) => setA({ ...a, initial: Math.max(0, v) })} />
          <Field label="Horizon (years)" value={a.years} step={1} min={1} max={60} width={80} onChange={(v) => setA({ ...a, years: Math.min(60, Math.max(1, v)) })} />
          <PathReturnFields a={a} onChange={(patch) => setA({ ...a, ...patch })} />
          <Field label="Monthly contribution ($)" value={a.monthlyContribution} step={100} min={0} onChange={(v) => setA({ ...a, monthlyContribution: Math.max(0, v) })} />
          <Field label="Monthly withdrawal ($)" value={a.monthlyWithdrawal} step={100} min={0} onChange={(v) => setA({ ...a, monthlyWithdrawal: Math.max(0, v) })} />
          <Field label="Inflation (%/yr)" value={a.inflation} step={0.25} min={0} width={80} onChange={(v) => setA({ ...a, inflation: Math.max(0, v) })} />
        </div>
        <ErrorList errors={returnErrs} />
      </Card>

      {/* stress selection with explicit metadata */}
      <Card>
        <CardTitle sub="explicit assumption changes — not reproductions of past crises. Each stress is applied separately to the base plan; stresses are not combined.">
          Illustrative stress scenarios
        </CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 8, marginTop: 4 }}>
          {STRESS_PRESETS.map((p: StressPreset) => {
            const on = active.includes(p.id);
            return (
              <label key={p.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "11px 13px",
                borderRadius: 10, border: `1px solid ${on ? T.blue : T.line}`, cursor: "pointer",
                background: on ? T.blueL : "transparent" }}>
                <input type="checkbox" checked={on} style={{ marginTop: 2 }}
                  onChange={(e) => setActive(e.target.checked ? [...active, p.id] : active.filter((x) => x !== p.id))} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: T.text, ...ui }}>{p.label}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: T.muted, ...ui, marginTop: 2, lineHeight: 1.45 }}>{p.desc}</span>
                  <span style={{ display: "block", fontSize: 10.5, color: T.dim, ...ui, marginTop: 6, lineHeight: 1.5 }}>
                    <b style={{ color: T.muted, fontWeight: 600 }}>Change:</b> {p.change}<br />
                    <b style={{ color: T.muted, fontWeight: 600 }}>When:</b> {p.timing}<br />
                    <b style={{ color: T.muted, fontWeight: 600 }}>Duration:</b> {p.duration} · <i>{p.kind}</i>
                  </span>
                  {p.id === "decline" && on && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 8 }}
                      onClick={(e) => e.preventDefault()}>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.05em" }}>Shock year</span>
                      <input type="number" value={shockYear} min={1} max={a.years} step={1} aria-label="Shock year"
                        onClick={(e) => e.preventDefault()}
                        onChange={(e) => setShockYear(Math.min(a.years, Math.max(1, Math.round(parseFloat(e.target.value) || 1))))}
                        style={{ width: 56, padding: "5px 8px", borderRadius: 7, border: `1px solid ${T.line2}`,
                          background: T.panel, color: T.text, fontSize: 12, ...mono }} />
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </Card>

      {base && (
        <>
          <ModelChart
            ariaLabel={`Base projection versus ${stressed.length} illustrative stress scenarios`}
            series={series}
            markers={markers}
          />

          {active.includes("volatility") && (
            <Card style={{ borderColor: `${T.amber}44` }}>
              <p style={{ fontSize: 12.5, color: T.dim, ...ui, margin: 0, lineHeight: 1.6 }}>
                <b style={{ color: T.text }}>Higher volatility:</b> volatility is a risk metric in this Model, not a
                return input — so raising it does not change the deterministic modeled ending value. It widens the
                range of outcomes an advisor should expect around any path, which is why it is listed here without
                its own chart line or dollar impact.
              </p>
            </Card>
          )}

          {stressed.length > 0 && (
            <Card style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
                <thead><tr>
                  {["Scenario", "Exact change", "Modeled ending", "vs. base ($)", "vs. base (%)", "Sustainability"].map((h) => (
                    <th key={h} style={{ textAlign: "left", fontSize: 10.5, color: T.muted, ...ui, padding: "4px 14px 8px 0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {[{ p: null as StressPreset | null, r: base, color: PATH_COLORS.base }, ...stressed].map(({ p, r, color }) => {
                    const delta = r.ending.base - base.ending.base;
                    const pct = base.ending.base > 0 ? (delta / base.ending.base) * 100 : 0;
                    const sus = sustainability(r);
                    const riskOnly = p?.riskMetricOnly;
                    return (
                      <tr key={p?.id ?? "base"} style={{ borderTop: `1px solid ${T.line}` }}>
                        <td style={{ padding: "9px 14px 9px 0", fontSize: 12.5, fontWeight: p ? 500 : 700, color: T.text, ...ui, whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: color, marginRight: 7 }} />
                          {p?.label ?? "Base plan"}
                        </td>
                        <td style={{ padding: "9px 14px 9px 0", fontSize: 11.5, color: T.dim, ...ui, maxWidth: 220 }}>
                          {p ? (p.id === "decline" ? `Portfolio value −30%, start of year ${Math.min(shockYear, a.years)}` : p.change) : "—"}
                        </td>
                        <td style={{ padding: "9px 14px 9px 0", fontSize: 12.5, color: T.text, ...mono }}>{fmtMoney(r.ending.base)}</td>
                        <td style={{ padding: "9px 14px 9px 0", fontSize: 12.5, color: !p ? T.muted : riskOnly ? T.muted : delta < 0 ? T.red : T.muted, ...mono }}>
                          {!p ? "—" : riskOnly ? "no change" : `${delta < 0 ? "−" : "+"}${fmtMoney(Math.abs(delta))}`}
                        </td>
                        <td style={{ padding: "9px 14px 9px 0", fontSize: 12.5, color: !p || riskOnly ? T.muted : pct < 0 ? T.red : T.muted, ...mono }}>
                          {!p ? "—" : riskOnly ? "—" : `${pct < 0 ? "−" : "+"}${Math.abs(pct).toFixed(1)}%`}
                        </td>
                        <td style={{ padding: "9px 0", fontSize: 12, color: sus.bad ? T.red : T.green, ...ui }}>{sus.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          {/* result summary */}
          {worst && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <StatTile label="Base modeled ending" value={fmtMoney(base.ending.base)} sub={`${a.years}y · illustrative`} />
              <StatTile label={`Under ${worst.p.label}`} value={fmtMoney(worst.r.ending.base)} sub="most damaging selected stress" tone="down" />
              <StatTile label="Dollar impact" value={`−${fmtMoney(Math.abs(worst.r.ending.base - base.ending.base))}`} tone="down" />
              <StatTile label="Percentage impact"
                value={`−${base.ending.base > 0 ? Math.abs(((worst.r.ending.base - base.ending.base) / base.ending.base) * 100).toFixed(1) : "0.0"}%`}
                tone="down" />
              <StatTile label="Sustainability under stress"
                value={sustainability(worst.r).bad ? sustainability(worst.r).text : "Lasts the horizon"}
                tone={sustainability(worst.r).bad ? "down" : "up"}
                sub={`${worst.p.label} · ${worst.p.kind}`} />
            </div>
          )}

          <Methodology a={baseA} extra={[
            "Each stress modifies the stated assumptions only and is applied separately to the base plan — stresses are not combined.",
            declineOn ? `Market decline: a one-time −30% applied at the start of year ${Math.min(shockYear, a.years)}; growth then continues at the unchanged return assumptions.` : "",
            active.includes("lostdecade") ? "Extended low-return period: returns run 3 percentage points below the base assumption for years 1–10, then normal assumptions resume." : "",
            "Stress scenarios are illustrative and do not reproduce any specific historical event.",
          ].filter(Boolean)} />
        </>
      )}
    </div>
  );
}
