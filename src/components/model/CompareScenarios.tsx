"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { T, ui, mono } from "../tokens";
import { loadPrefs } from "../../lib/prefs";
import type { ModelHandoff, HandoffPortfolio } from "../../lib/handoff";
import {
  projectPaths, saveScenario, scenarioDiff, spreadReturns,
  fmtMoney, type ModelAssumptions,
} from "../../lib/model";
import {
  Card, CardTitle, Field, GhostBtn, SourceBanner, Methodology, PathReturnFields,
  DEFAULTS, SCEN_COLORS, deriveAssumptions,
} from "./shared";
import { ModelChart, pathLine, type ChartSeries } from "./ModelChart";

// ════════════════════════════════════════════════════════════════════════════
//  Compare Scenarios — named assumption sets side by side, with an explicit
//  difference summary. Portfolio-sourced Current/Proposed seeding preserved;
//  the source portfolio is never mutated from here.
// ════════════════════════════════════════════════════════════════════════════

interface Scenario { id: number; name: string; a: ModelAssumptions; visible: boolean; colorIdx: number; src?: string; note?: string }

const BENCH_COLOR = "#9CA3AF";

// Transparent assumption presets: each duplicates the active scenario and
// states exactly what changed. The source scenario/portfolio is never touched.
const SCENARIO_PRESETS: { label: string; change: string; apply: (a: ModelAssumptions) => ModelAssumptions }[] = [
  { label: "Lower Return Environment", change: "Downside/Base/Upside return assumptions −2 pts",
    apply: (a) => ({ ...a, downReturn: +(a.downReturn - 2).toFixed(2), baseReturn: +(a.baseReturn - 2).toFixed(2), upReturn: +(a.upReturn - 2).toFixed(2) }) },
  { label: "Higher Inflation", change: "inflation assumption +2 pts",
    apply: (a) => ({ ...a, inflation: +(a.inflation + 2).toFixed(2) }) },
  { label: "Lower Volatility", change: "volatility risk metric ×0.6 (context only — paths unchanged)",
    apply: (a) => ({ ...a, annualVol: +(a.annualVol * 0.6).toFixed(2) }) },
  { label: "Market Stress", change: "30% one-time decline at the start",
    apply: (a) => ({ ...a, initialShockPct: 30, shockYear: 1 }) },
];

export function CompareScenarios({ seed, onReturnToPortfolio }: {
  seed?: ModelHandoff | null; onReturnToPortfolio?: () => void;
}) {
  const [shared, setShared] = useState({ initial: 100_000, years: seed?.horizonYears || 20, inflation: 2.5 });
  const [scens, setScens] = useState<Scenario[]>(seed?.second ? [] : [
    { id: 1, name: "Current allocation", visible: true, colorIdx: 0, a: { ...DEFAULTS, ...spreadReturns(6), annualVol: 10 } },
    { id: 2, name: "Higher-growth allocation", visible: true, colorIdx: 1, a: { ...DEFAULTS, ...spreadReturns(7.5), annualVol: 14 } },
  ]);
  const [sel, setSel] = useState(1);
  const nextId = useRef(3);
  const [saved, setSaved] = useState(false);
  const [seedLoading, setSeedLoading] = useState(!!seed?.second);
  const [presetNote, setPresetNote] = useState("");
  const [bench, setBench] = useState<{ label: string; a: ModelAssumptions } | null>(null);
  const [showBench, setShowBench] = useState(false);

  // Seed from a Portfolio handoff: Current + Proposed become separate scenarios
  // with assumptions derived from each portfolio's actual holdings.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!seed?.second || seededFor.current === seed.primary.name) return;
    seededFor.current = seed.primary.name;
    (async () => {
      try {
        const [dp, dc] = await Promise.all([
          deriveAssumptions(seed.primary.holdings),
          deriveAssumptions(seed.second!.holdings),
        ]);
        const mk = (id: number, colorIdx: number, pf: HandoffPortfolio, d: Awaited<ReturnType<typeof deriveAssumptions>>): Scenario => ({
          id, name: pf.name, visible: true, colorIdx, src: `${pf.holdings.length} holdings · from Portfolio`,
          a: { ...DEFAULTS, monthlyWithdrawal: 0, ...spreadReturns(d?.baseReturn ?? 6),
            annualVol: d?.annualVol ?? DEFAULTS.annualVol, expenseRatio: d?.expenseRatio ?? DEFAULTS.expenseRatio },
        });
        setScens([mk(1, 0, seed.second!, dc), mk(2, 1, seed.primary, dp)]);
        setSel(2); nextId.current = 3;
      } catch { /* fall back to empty state */ }
      setSeedLoading(false);
    })();
  }, [seed]);

  // Benchmark overlay (default from Settings preference) — growth with no cash flows.
  const toggleBench = async () => {
    if (showBench) { setShowBench(false); return; }
    if (!bench) {
      try {
        const t = loadPrefs().benchmark;
        const d = await deriveAssumptions([{ ticker: t, weight: 100 }]);
        if (d) setBench({ label: `${t} benchmark (no cash flows)`, a: { ...DEFAULTS, monthlyContribution: 0, monthlyWithdrawal: 0, ...spreadReturns(d.baseReturn), annualVol: d.annualVol ?? DEFAULTS.annualVol, expenseRatio: d.expenseRatio ?? DEFAULTS.expenseRatio } });
      } catch { /* leave hidden */ }
    }
    setShowBench(true);
  };

  const results = useMemo(() => scens.map((s) => ({
    s, r: projectPaths({ ...s.a, initial: shared.initial, years: shared.years, inflation: shared.inflation }),
  })), [scens, shared]);
  const benchResult = useMemo(() => (showBench && bench
    ? projectPaths({ ...bench.a, initial: shared.initial, years: shared.years, inflation: shared.inflation })
    : null), [showBench, bench, shared]);

  const selIdx = Math.max(0, scens.findIndex((s) => s.id === sel));
  const selected = scens[selIdx];
  const nextColor = () => {
    const used = new Set(scens.map((s) => s.colorIdx));
    for (let i = 0; i < SCEN_COLORS.length; i++) if (!used.has(i)) return i;
    return scens.length % SCEN_COLORS.length;
  };
  const upd = (id: number, patch: Partial<ModelAssumptions>) =>
    setScens(scens.map((s) => (s.id === id ? { ...s, a: { ...s.a, ...patch } } : s)));

  const duplicate = () => {
    if (scens.length >= 4 || !selected) return;
    const created: Scenario = { id: nextId.current, name: `${selected.name} (copy)`, visible: true, colorIdx: nextColor(), a: { ...selected.a } };
    setScens([...scens, created]);
    setSel(nextId.current); nextId.current++;
  };
  const applyPreset = (preset: typeof SCENARIO_PRESETS[number]) => {
    if (scens.length >= 4 || !selected) return;
    const created: Scenario = { id: nextId.current, name: `${selected.name} · ${preset.label}`, visible: true,
      colorIdx: nextColor(), note: preset.change, a: preset.apply({ ...selected.a }) };
    setScens([...scens, created]);
    setSel(nextId.current); nextId.current++;
    setPresetNote(`${preset.label} scenario created — ${preset.change}. The source scenario is unchanged; edit or delete the copy freely.`);
  };
  const remove = () => {
    if (scens.length <= 1 || !selected) return;
    if (selected.src && !window.confirm(`Delete "${selected.name}"? It was loaded from a portfolio — the source portfolio itself is not affected.`)) return;
    const rest = scens.filter((s) => s.id !== sel);
    setScens(rest); setSel(rest[0].id);
  };

  // Difference summary: selected scenario vs the first (baseline) scenario.
  const baseline = results[0];
  const selResult = results[selIdx];
  const diff = useMemo(() => {
    if (!baseline || !selResult || baseline.s.id === selResult.s.id) return null;
    const wrap = (x: typeof baseline) => ({ name: x.s.name, a: { ...x.s.a, initial: shared.initial, years: shared.years, inflation: shared.inflation } });
    return scenarioDiff(wrap(baseline), wrap(selResult), baseline.r, selResult.r);
  }, [baseline, selResult, shared]);

  // Chart: base line per visible scenario; selected scenario also shows its
  // Downside/Upside assumption paths as thin dashes in the same color.
  const chartSeries: ChartSeries[] = [
    ...results.filter(({ s }) => s.visible).flatMap(({ s, r }) => {
      const color = SCEN_COLORS[s.colorIdx % SCEN_COLORS.length];
      const isSel = s.id === sel;
      const out: ChartSeries[] = [{ label: s.name, points: pathLine(r, "base"), color, width: isSel ? 2.4 : 1.7 }];
      if (isSel) out.push(
        { label: `${s.name} · upside`, points: pathLine(r, "up"), color, dash: "2 4", width: 1.1 },
        { label: `${s.name} · downside`, points: pathLine(r, "down"), color, dash: "2 4", width: 1.1 },
      );
      return out;
    }),
    ...(benchResult && bench ? [{ label: bench.label, points: pathLine(benchResult, "base"), color: BENCH_COLOR, dash: "8 4", width: 1.4 }] : []),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {seed?.second && (
        <SourceBanner pf={seed.primary} horizon={seed.horizonYears} onReturn={onReturnToPortfolio} loading={seedLoading} />
      )}
      <Card>
        <CardTitle sub="applied to every scenario">Shared assumptions</CardTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
          <Field label="Starting value ($)" value={shared.initial} step={5000} min={0} onChange={(v) => setShared({ ...shared, initial: Math.max(0, v) })} />
          <Field label="Horizon (years)" value={shared.years} step={1} min={1} max={60} width={80} onChange={(v) => setShared({ ...shared, years: Math.min(60, Math.max(1, v)) })} />
          <Field label="Inflation (%/yr)" value={shared.inflation} step={0.25} min={0} width={80} onChange={(v) => setShared({ ...shared, inflation: Math.max(0, v) })} />
        </div>
      </Card>

      {/* scenario chips: select · toggle visibility · source tag */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {scens.map((s) => {
          const isSel = s.id === sel;
          return (
            <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 0, borderRadius: 10,
              border: `1.5px solid ${isSel ? T.blue : T.line2}`,
              background: isSel ? T.blueL : T.panel, opacity: s.visible ? 1 : 0.55,
              boxShadow: isSel ? `0 0 0 3px ${T.blue}22` : "none" }}>
              <button onClick={() => setSel(s.id)} title={s.src ?? s.note} aria-pressed={isSel}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 8px 8px 14px",
                  border: "none", background: "transparent", cursor: "pointer",
                  fontSize: 12.5, fontWeight: isSel ? 700 : 600, color: T.text, ...ui }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: SCEN_COLORS[s.colorIdx % SCEN_COLORS.length] }} />
                {s.name}
                {isSel && <span style={{ fontSize: 9, fontWeight: 700, color: T.blue, ...ui }}>SELECTED</span>}
                {s.src && <span style={{ fontSize: 9, fontWeight: 700, color: T.blue, background: T.panel,
                  border: `1px solid ${T.blue}33`, borderRadius: 5, padding: "1px 6px", ...ui }}>Portfolio</span>}
              </button>
              <button aria-label={`${s.visible ? "Hide" : "Show"} ${s.name} on the chart`} aria-pressed={s.visible}
                onClick={() => setScens(scens.map((x) => x.id === s.id ? { ...x, visible: !x.visible } : x))}
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: "8px 11px 8px 4px",
                  color: s.visible ? T.dim : T.muted, display: "flex" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" stroke="currentColor" strokeWidth="1.2"/>
                  <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/>
                  {!s.visible && <line x1="2.5" y1="13.5" x2="13.5" y2="2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>}
                </svg>
              </button>
            </span>
          );
        })}
        <button onClick={toggleBench} aria-pressed={showBench}
          style={{ padding: "8px 13px", borderRadius: 10, cursor: "pointer",
            border: `1px dashed ${showBench ? T.blue : T.line2}`, background: showBench ? T.blueL : "transparent",
            fontSize: 12, fontWeight: 600, color: showBench ? T.blue : T.dim, ...ui }}>
          {showBench ? "Benchmark ✓" : "+ Benchmark"}
        </button>
        {seed?.second && onReturnToPortfolio && (
          <button onClick={onReturnToPortfolio}
            style={{ padding: "8px 13px", borderRadius: 10, cursor: "pointer", background: T.panel,
              border: `1px solid ${T.line2}`, color: T.dim, fontSize: 11.5, fontWeight: 600, ...ui, marginLeft: "auto" }}>
            ← Return to Portfolio
          </button>
        )}
      </div>

      {/* presets — duplicate the selected scenario with a stated change */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.08em" }}>Presets</span>
        {SCENARIO_PRESETS.map((pr) => (
          <button key={pr.label} onClick={() => applyPreset(pr)} disabled={scens.length >= 4} title={`Duplicates the selected scenario: ${pr.change}`}
            style={{ padding: "7px 12px", borderRadius: 9, cursor: scens.length >= 4 ? "default" : "pointer",
              background: T.panel, border: `1px solid ${T.line}`, color: scens.length >= 4 ? T.muted : T.dim,
              fontSize: 11.5, fontWeight: 600, ...ui }}>
            {pr.label}
          </button>
        ))}
        {presetNote && <span style={{ fontSize: 11.5, color: T.green, ...ui }}>{presetNote}</span>}
      </div>

      {selected && (
        <Card>
          <CardTitle sub={selected.note ? `created as: ${selected.note}` : undefined}>
            Edit scenario — {selected.name}
          </CardTitle>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.05em" }}>Scenario name</span>
              <input value={selected.name}
                onChange={(e) => setScens(scens.map((s) => s.id === sel ? { ...s, name: e.target.value } : s))}
                style={{ width: 220, padding: "9px 11px", borderRadius: 9, border: `1px solid ${T.line2}`, background: T.panel, color: T.text, fontSize: 13, ...ui }} />
            </label>
            <PathReturnFields a={selected.a} onChange={(patch) => upd(sel, patch)} />
            <Field label="Volatility — risk metric (%)" value={selected.a.annualVol} step={0.5} min={0} width={90} onChange={(v) => upd(sel, { annualVol: Math.max(0, v) })} />
            <Field label="Expenses (%/yr)" value={selected.a.expenseRatio} step={0.05} min={0} width={80} onChange={(v) => upd(sel, { expenseRatio: Math.max(0, v) })} />
            <Field label="Monthly contribution ($)" value={selected.a.monthlyContribution} step={100} min={0} onChange={(v) => upd(sel, { monthlyContribution: Math.max(0, v) })} />
            <Field label="Monthly withdrawal ($)" value={selected.a.monthlyWithdrawal} step={100} min={0} onChange={(v) => upd(sel, { monthlyWithdrawal: Math.max(0, v) })} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <GhostBtn onClick={duplicate} disabled={scens.length >= 4}>{scens.length >= 4 ? "Max 4 scenarios" : "Duplicate"}</GhostBtn>
            {scens.length > 1 && <GhostBtn danger onClick={remove}>Delete scenario</GhostBtn>}
            <GhostBtn onClick={() => { saveScenario({ name: selected.name, tool: "scenarios", subject: `${scens.length} scenarios · ${shared.years}y`, assumptions: { ...selected.a, initial: shared.initial, years: shared.years, inflation: shared.inflation } }); setSaved(true); }}>
              {saved ? "Saved ✓" : "Save selected scenario"}
            </GhostBtn>
          </div>
        </Card>
      )}

      {scens.length > 0 && (
        <ModelChart
          ariaLabel={`Illustrative comparison of ${scens.filter((x) => x.visible).length} scenario base paths over ${shared.years} years`}
          series={chartSeries}
        />
      )}

      {/* difference summary — exactly what changed, B vs A */}
      {diff && baseline && selResult && (
        <Card>
          <CardTitle sub="assumption and outcome deltas — no “better/worse” labels">
            Difference summary — {selResult.s.name} vs. {baseline.s.name}
          </CardTitle>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 26px" }}>
            {diff.map((d) => (
              <span key={d.label} style={{ fontSize: 12.5, color: T.dim, ...ui }}>
                <span style={{ color: T.muted }}>{d.label}: </span>
                <span style={{ fontWeight: 700, ...mono, color: T.text }}>{d.delta}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {scens.length > 0 && (
        <Card style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
            <thead><tr>
              {["Scenario", "Ending (base)", "Ending (downside)", "Ending (upside)", "Volatility", "Expenses", "Sustainability"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 10.5, color: T.muted, ...ui, padding: "4px 14px 8px 0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {results.map(({ s, r }) => {
                const dep = r.depletionMonth.base ?? r.depletionMonth.down;
                return (
                  <tr key={s.id} style={{ borderTop: `1px solid ${T.line}`, background: s.id === sel ? T.blueL : "transparent" }}>
                    <td style={{ padding: "9px 14px 9px 0", fontSize: 12.5, fontWeight: 600, color: T.text, ...ui, whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: SCEN_COLORS[s.colorIdx % SCEN_COLORS.length], marginRight: 7 }} />{s.name}
                    </td>
                    <td style={{ padding: "9px 14px 9px 0", fontSize: 12.5, color: T.text, ...mono }}>{fmtMoney(r.ending.base)}</td>
                    <td style={{ padding: "9px 14px 9px 0", fontSize: 12.5, color: T.dim, ...mono }}>{fmtMoney(r.ending.down)}</td>
                    <td style={{ padding: "9px 14px 9px 0", fontSize: 12.5, color: T.dim, ...mono }}>{fmtMoney(r.ending.up)}</td>
                    <td style={{ padding: "9px 14px 9px 0", fontSize: 12.5, color: T.dim, ...mono }}>{s.a.annualVol.toFixed(1)}%</td>
                    <td style={{ padding: "9px 14px 9px 0", fontSize: 12.5, color: T.dim, ...mono }}>{s.a.expenseRatio.toFixed(2)}%</td>
                    <td style={{ padding: "9px 0", fontSize: 12, color: dep ? T.red : T.green, ...ui }}>
                      {r.depletionMonth.base ? `Depletes ~yr ${Math.ceil(r.depletionMonth.base / 12)} (base)` : r.depletionMonth.down ? `Downside depletes ~yr ${Math.ceil(r.depletionMonth.down / 12)}` : "Lasts horizon"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: T.muted, ...ui, margin: "12px 0 0" }}>
            Modeled outputs under user-entered assumptions — illustrative only. A higher ending value is not automatically better.
          </p>
        </Card>
      )}

      {selected && (
        <Methodology a={{ ...selected.a, initial: shared.initial, years: shared.years, inflation: shared.inflation }}
          extra={["Scenario colors are consistent across chips, chart lines, the legend, and this table."]} />
      )}
      {!scens.length && (
        <Card><span style={{ fontSize: 12.5, color: T.muted, ...ui }}>
          {seedLoading ? "Preparing scenarios from your portfolios…" : "No scenarios yet — duplicate one or load portfolios from the Portfolio workspace."}
        </span></Card>
      )}
    </div>
  );
}
