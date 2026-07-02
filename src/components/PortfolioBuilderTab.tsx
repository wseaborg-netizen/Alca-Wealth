"use client";
import React, { useEffect, useMemo, useState } from "react";
import { T, ui, mono } from "./tokens";
import { Card, Label, Btn } from "./ui";
import {
  type Client, type RiskLevel, type Goal, type AccountType,
  RISK_LABELS, ACCOUNT_LABELS, GOAL_LABELS,
  newClient, loadClients, upsertClient, deleteClient, totalAssets,
} from "../lib/client";
import {
  type Vehicle, type Sleeve, type PlacementResult,
  targetSleeves, placeAssets, assetClassMix, equityFraction,
} from "../lib/portfolioModel";
import type { FundRecord } from "../lib/funds";
import { blendKpis, type Holding, type BlendedKpis } from "../lib/portfolioCalc";

const money = (v: number) =>
  v == null ? "-" : "$" + Math.round(v).toLocaleString("en-US");
// KPI percentage values arrive already in percent units (e.g. 19.53 = 19.53%).
const pct1 = (v: number | null) => (v == null ? "-" : `${v.toFixed(1)}%`);
const pct2 = (v: number | null) => (v == null ? "-" : `${v.toFixed(2)}%`);
const num2 = (v: number | null) => (v == null ? "-" : v.toFixed(2));

const CLASS_COLOR: Record<string, string> = {
  equity: T.data, fixed: T.amber, cash: T.muted,
};
const TAX_LABEL: Record<string, string> = {
  efficient: "Tax-efficient", neutral: "Neutral", inefficient: "Tax-inefficient",
};

// ── Small form primitives ────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 10.5, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", ...ui }}>{label}</span>
      {children}
    </div>
  );
}
const inputStyle: React.CSSProperties = {
  background: T.panel3, border: `1px solid ${T.line2}`, borderRadius: 7,
  padding: "8px 11px", color: T.text, fontSize: 13, outline: "none", ...ui, width: "100%", boxSizing: "border-box",
};

// ── Main ─────────────────────────────────────────────────────────────────────
export default function PortfolioBuilderTab() {
  const [clients, setClients] = useState<Client[]>([]);
  const [draft, setDraft] = useState<Client>(newClient());
  const [vehicle, setVehicle] = useState<Vehicle>("ETF");
  const [built, setBuilt] = useState<{ sleeves: Sleeve[]; placement: PlacementResult } | null>(null);
  const [metrics, setMetrics] = useState<BlendedKpis | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    const list = loadClients();
    setClients(list);
    if (list.length) setDraft(list[0]);
  }, []);

  const set = <K extends keyof Client>(k: K, v: Client[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setAccount = (type: AccountType, balance: number) =>
    setDraft((d) => ({ ...d, accounts: d.accounts.map((a) => (a.type === type ? { ...a, balance } : a)) }));

  const saveClient = () => {
    const name = draft.name.trim() || "Untitled Client";
    const c = { ...draft, name };
    const list = upsertClient(c);
    setClients(list);
    setDraft(c);
  };
  const selectClient = (id: string) => {
    const c = clients.find((x) => x.id === id);
    if (c) { setDraft(c); setBuilt(null); setMetrics(null); }
  };
  const removeClient = () => {
    const list = deleteClient(draft.id);
    setClients(list);
    setDraft(list[0] ?? newClient());
    setBuilt(null); setMetrics(null);
  };

  const total = totalAssets(draft);

  const build = () => {
    const sleeves = targetSleeves(draft, vehicle);
    const placement = placeAssets(draft, sleeves, vehicle);
    setBuilt({ sleeves, placement });
    // Fetch live metrics for the blended snapshot
    void fetchBlended(sleeves);
  };

  const fetchBlended = async (sleeves: Sleeve[]) => {
    setMetricsLoading(true); setMetrics(null);
    try {
      const uniq = Array.from(new Map(sleeves.map((s) => [s.fund.ticker, s])).values());
      const results = await Promise.all(
        uniq.map(async (s) => {
          try {
            const r = await fetch(`/api/funds/${s.fund.ticker}`);
            if (!r.ok) return null;
            const fund: FundRecord = await r.json();
            if (fund.error) return null;
            return { ticker: s.fund.ticker, weight: Math.round(s.weight * 100), fund } as Holding;
          } catch { return null; }
        })
      );
      const holdings = results.filter((h): h is Holding => h != null);
      if (holdings.length) setMetrics(blendKpis(holdings));
    } finally {
      setMetricsLoading(false);
    }
  };

  const mix = built ? assetClassMix(built.sleeves) : null;
  const eqFrac = useMemo(() => equityFraction(draft), [draft]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1080 }}>

      {/* ── Header ── */}
      <div>
        <h2 style={{ ...ui, fontSize: 22, fontWeight: 300, color: T.text, margin: 0, letterSpacing: "0.01em",
          fontFamily: "'Cormorant Garamond', Georgia, serif" }}>Portfolio Builder</h2>
        <p style={{ fontSize: 12.5, color: T.dim, marginTop: 4, ...ui }}>
          Enter a client profile, then generate a target allocation, fund selections, and an
          asset-location plan that places each fund in the right account.
        </p>
      </div>

      {/* ── Client bar ── */}
      <Card>
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.06em" }}>Client</span>
          <select value={draft.id} onChange={(e) => selectClient(e.target.value)}
            style={{ ...inputStyle, width: "auto", minWidth: 180 }}>
            {clients.length === 0 && <option value={draft.id}>New client</option>}
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name || "Untitled"}</option>)}
            {clients.length > 0 && !clients.find((c) => c.id === draft.id) && (
              <option value={draft.id}>{draft.name || "New client"}</option>
            )}
          </select>
          <Btn small onClick={() => { setDraft(newClient()); setBuilt(null); setMetrics(null); }}>+ New</Btn>
          <Btn small onClick={saveClient}>Save</Btn>
          {clients.find((c) => c.id === draft.id) && <Btn small onClick={removeClient}>Delete</Btn>}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: T.dim, ...mono }}>Investable: <b style={{ color: T.text }}>{money(total)}</b></span>
        </div>
      </Card>

      {/* ── Intake form ── */}
      <Card>
        <div style={{ padding: "18px 20px" }}>
          <Label>Client Profile</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 12 }}>
            <Field label="Name">
              <input style={inputStyle} value={draft.name} placeholder="e.g. Jane Doe"
                onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Age">
              <input style={inputStyle} type="number" value={draft.age ?? ""} placeholder="e.g. 58"
                onChange={(e) => set("age", e.target.value === "" ? null : Number(e.target.value))} />
            </Field>
            <Field label="Time horizon (yrs)">
              <input style={inputStyle} type="number" value={draft.horizonYears ?? ""} placeholder="e.g. 15"
                onChange={(e) => set("horizonYears", e.target.value === "" ? null : Number(e.target.value))} />
            </Field>
            <Field label="Tax bracket (%)">
              <input style={inputStyle} type="number" value={draft.taxBracket ?? ""} placeholder="e.g. 32"
                onChange={(e) => set("taxBracket", e.target.value === "" ? null : Number(e.target.value))} />
            </Field>
            <Field label="State">
              <input style={inputStyle} value={draft.state} placeholder="e.g. CA"
                onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))} />
            </Field>
            <Field label="Goal">
              <select style={inputStyle} value={draft.goal} onChange={(e) => set("goal", e.target.value as Goal)}>
                {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}
              </select>
            </Field>
          </div>

          {/* Risk slider */}
          <div style={{ marginTop: 18 }}>
            <Field label={`Risk tolerance - ${RISK_LABELS[draft.risk]}`}>
              <input type="range" min={1} max={5} step={1} value={draft.risk}
                onChange={(e) => set("risk", Number(e.target.value) as RiskLevel)}
                style={{ width: "100%", accentColor: T.data }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: T.muted, ...ui }}>
                <span>Conservative</span><span>Moderate</span><span>Aggressive</span>
              </div>
            </Field>
          </div>

          {/* Accounts */}
          <div style={{ marginTop: 18 }}>
            <Label>Accounts &amp; Balances</Label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 12 }}>
              {(["taxable", "traditional", "roth"] as AccountType[]).map((t) => {
                const acct = draft.accounts.find((a) => a.type === t);
                return (
                  <Field key={t} label={ACCOUNT_LABELS[t]}>
                    <input style={inputStyle} type="number" value={acct?.balance || ""} placeholder="$0"
                      onChange={(e) => setAccount(t, Number(e.target.value) || 0)} />
                  </Field>
                );
              })}
            </div>
          </div>

          {/* Build controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
            {/* Vehicle toggle */}
            <div style={{ display: "inline-flex", border: `1px solid ${T.line2}`, borderRadius: 8, overflow: "hidden" }}>
              {(["ETF", "Mutual Fund"] as Vehicle[]).map((v) => (
                <button key={v} onClick={() => setVehicle(v)}
                  style={{ padding: "8px 16px", fontSize: 12, ...ui, cursor: "pointer", border: "none",
                    background: vehicle === v ? T.text : "transparent",
                    color: vehicle === v ? T.bg : T.dim, fontWeight: 600 }}>
                  {v}
                </button>
              ))}
            </div>
            <Btn accent onClick={build}>Build Portfolio -&gt;</Btn>
            <span style={{ fontSize: 11, color: T.muted, ...ui }}>
              Target equity: <b style={{ color: T.text, ...mono }}>{Math.round(eqFrac * 100)}%</b>
            </span>
          </div>
        </div>
      </Card>

      {/* ── Results ── */}
      {built && (
        <>
          {/* Allocation */}
          <Card>
            <div style={{ padding: "18px 20px" }}>
              <Label>Target Allocation</Label>
              {/* stacked bar */}
              <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", marginTop: 12, gap: 1 }}>
                {built.sleeves.map((s) => (
                  <div key={s.key} title={`${s.label} ${(s.weight * 100).toFixed(0)}%`}
                    style={{ width: `${s.weight * 100}%`, background: CLASS_COLOR[s.assetClass], opacity: s.assetClass === "equity" ? 1 : 0.7 }} />
                ))}
              </div>
              {mix && (
                <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
                  {([["equity", "Equity"], ["fixed", "Fixed Income"], ["cash", "Cash"]] as [keyof typeof mix, string][])
                    .filter(([k]) => mix[k] > 0)
                    .map(([k, l]) => (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: CLASS_COLOR[k] }} />
                      <span style={{ fontSize: 12, color: T.dim, ...ui }}>{l}</span>
                      <span style={{ fontSize: 12, color: T.text, ...mono, fontWeight: 600 }}>{Math.round(mix[k] * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Sleeve table */}
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                {built.sleeves.map((s) => (
                  <div key={s.key} style={{ display: "grid", gridTemplateColumns: "1.4fr 70px 1.6fr 60px",
                    gap: 10, alignItems: "center", padding: "8px 12px", background: T.panel3,
                    border: `1px solid ${T.line}`, borderRadius: 7 }}>
                    <span style={{ fontSize: 12.5, color: T.text, ...ui }}>{s.label}</span>
                    <span style={{ fontSize: 13, color: T.text, ...mono, fontWeight: 700 }}>{s.fund.ticker}</span>
                    <span style={{ fontSize: 11, color: T.dim, ...ui, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.fund.name}</span>
                    <span style={{ fontSize: 13, color: T.data, ...mono, fontWeight: 600, textAlign: "right" }}>{Math.round(s.weight * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Asset location plan */}
          <Card>
            <div style={{ padding: "18px 20px" }}>
              <Label>Asset Location - What to Buy in Each Account</Label>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(built.placement.plans.length, 1)}, 1fr)`, gap: 14, marginTop: 12 }}>
                {built.placement.plans.map((p) => (
                  <div key={p.type} style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.line}`, background: T.panel3 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text, ...ui }}>{p.label}</div>
                      <div style={{ fontSize: 11, color: T.dim, ...mono }}>{money(p.balance)}</div>
                    </div>
                    <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {p.lots.length === 0 && <span style={{ fontSize: 11, color: T.muted, ...ui }}>-</span>}
                      {p.lots.map((l, i) => (
                        <div key={i}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: T.text, ...mono }}>{l.ticker}</span>
                            <span style={{ fontSize: 12.5, color: T.text, ...mono, fontWeight: 600 }}>{money(l.amount)}</span>
                          </div>
                          <div style={{ fontSize: 10, color: T.muted, ...ui }}>{l.label}</div>
                          {l.note && <div style={{ fontSize: 10, color: T.amber, ...ui, marginTop: 2 }}>{l.note}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {/* Insights */}
              {built.placement.insights.length > 0 && (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                  {built.placement.insights.map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ color: T.data, fontSize: 12, lineHeight: 1.5 }}>&bull;</span>
                      <span style={{ fontSize: 11.5, color: T.dim, ...ui, lineHeight: 1.5 }}>{t}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Blended metrics */}
          <Card>
            <div style={{ padding: "18px 20px" }}>
              <Label>Blended Portfolio Snapshot</Label>
              {metricsLoading && <div style={{ fontSize: 12, color: T.muted, ...ui, marginTop: 12 }}>Loading live metrics...</div>}
              {!metricsLoading && metrics && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 12 }}>
                  {([
                    ["1-Yr Return", pct1(metrics.return1y)],
                    ["3-Yr CAGR", pct1(metrics.return3y)],
                    ["Sharpe (3y)", num2(metrics.sharpe3y)],
                    ["Max Drawdown", pct1(metrics.maxDrawdown3y)],
                    ["TTM Yield", metrics.ttmYield != null ? pct2(metrics.ttmYield) : "-"],
                    ["Blended Expense", metrics.expenseRatio != null ? pct2(metrics.expenseRatio) : "-"],
                    ["Beta (3y)", num2(metrics.beta3y)],
                    ["Alpha (3y)", metrics.alpha3y != null ? pct2(metrics.alpha3y) : "-"],
                  ] as [string, string][]).map(([l, v]) => (
                    <div key={l} style={{ background: T.panel3, border: `1px solid ${T.line}`, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 9.5, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: T.text, ...mono, marginTop: 3 }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
              {!metricsLoading && !metrics && (
                <div style={{ fontSize: 12, color: T.muted, ...ui, marginTop: 12 }}>
                  Live metrics unavailable right now (data source). The allocation and placement above are still valid.
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
