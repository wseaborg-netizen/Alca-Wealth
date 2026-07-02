"use client";
import React, { useEffect, useState } from "react";
import { T, ui, mono } from "./tokens";
import { Card, Label, Btn } from "./ui";
import {
  type Client, newClient, loadClients, upsertClient, totalHoldings,
} from "../lib/client";
import { type Vehicle, targetSleeves } from "../lib/portfolioModel";
import { computeTaxEfficiency } from "../lib/tax";
import type { FundRecord } from "../lib/funds";
import { blendKpis, type Holding, type BlendedKpis } from "../lib/portfolioCalc";

const money = (v: number) => (v == null ? "-" : "$" + Math.round(v).toLocaleString("en-US"));
const pctv = (v: number | null, d = 1) => (v == null ? "-" : `${v.toFixed(d)}%`);
const num2 = (v: number | null) => (v == null ? "-" : v.toFixed(2));

const inputStyle: React.CSSProperties = {
  background: T.panel3, border: `1px solid ${T.line2}`, borderRadius: 7,
  padding: "8px 11px", color: T.text, fontSize: 13, outline: "none", ...ui, boxSizing: "border-box",
};

interface Side {
  kpi: BlendedKpis;
  taxScore: number | null;
  n: number;
}

async function blendSide(items: { ticker: string; weight: number }[]): Promise<Side | null> {
  const results = await Promise.all(items.map(async (it) => {
    try {
      const r = await fetch(`/api/funds/${it.ticker}`);
      if (!r.ok) return null;
      const fund: FundRecord = await r.json();
      if (fund.error) return null;
      return { ticker: it.ticker, weight: it.weight, fund } as Holding;
    } catch { return null; }
  }));
  const holdings = results.filter((h): h is Holding => h != null);
  if (!holdings.length) return null;
  // weighted tax-efficiency score
  const tw = holdings.reduce((s, h) => s + h.weight, 0) || 1;
  const taxScore = Math.round(
    holdings.reduce((s, h) => s + computeTaxEfficiency({
      category: h.fund.category, name: h.fund.name, vehicle: h.fund.vehicle,
      expenseRatio: h.fund.expenseRatio, kpi: { ttmYield: h.fund.kpi.ttmYield },
    }).score * h.weight, 0) / tw
  );
  return { kpi: blendKpis(holdings), taxScore, n: holdings.length };
}

export default function ComparePortfolioTab() {
  const [clients, setClients] = useState<Client[]>([]);
  const [draft, setDraft] = useState<Client>(newClient());
  const [vehicle, setVehicle] = useState<Vehicle>("ETF");
  const [current, setCurrent] = useState<Side | null>(null);
  const [proposed, setProposed] = useState<Side | null>(null);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  useEffect(() => {
    const list = loadClients();
    setClients(list);
    if (list.length) setDraft(list[0]);
  }, []);

  const selectClient = (id: string) => {
    const c = clients.find((x) => x.id === id);
    if (c) { setDraft(c); setCurrent(null); setProposed(null); setRan(false); }
  };
  const saveHoldings = () => { const list = upsertClient(draft); setClients(list); };

  const addHolding = () => setDraft((d) => ({ ...d, holdings: [...d.holdings, { ticker: "", value: 0 }] }));
  const setHolding = (i: number, key: "ticker" | "value", v: string) =>
    setDraft((d) => ({ ...d, holdings: d.holdings.map((h, j) =>
      j === i ? { ...h, [key]: key === "ticker" ? v.toUpperCase() : (Number(v) || 0) } : h) }));
  const removeHolding = (i: number) =>
    setDraft((d) => ({ ...d, holdings: d.holdings.filter((_, j) => j !== i) }));

  const run = async () => {
    setLoading(true); setRan(true);
    saveHoldings();
    const totVal = totalHoldings(draft) || 1;
    const currentItems = draft.holdings
      .filter((h) => h.ticker && h.value > 0)
      .map((h) => ({ ticker: h.ticker, weight: (h.value / totVal) * 100 }));
    const sleeves = targetSleeves(draft, vehicle);
    const proposedItems = sleeves.map((s) => ({ ticker: s.fund.ticker, weight: s.weight * 100 }));
    const [cur, prop] = await Promise.all([
      currentItems.length ? blendSide(currentItems) : Promise.resolve(null),
      blendSide(proposedItems),
    ]);
    setCurrent(cur); setProposed(prop);
    setLoading(false);
  };

  // Comparison rows: [label, currentVal, proposedVal, higherIsBetter, fmt]
  const rows: Array<[string, number | null, number | null, boolean, (v: number | null) => string]> =
    current && proposed ? [
      ["1-Year Return", current.kpi.return1y, proposed.kpi.return1y, true, (v) => pctv(v)],
      ["3-Year CAGR", current.kpi.return3y, proposed.kpi.return3y, true, (v) => pctv(v)],
      ["5-Year CAGR", current.kpi.return5y, proposed.kpi.return5y, true, (v) => pctv(v)],
      ["Sharpe (3y)", current.kpi.sharpe3y, proposed.kpi.sharpe3y, true, num2],
      ["Max Drawdown (3y)", current.kpi.maxDrawdown3y, proposed.kpi.maxDrawdown3y, true, (v) => pctv(v)],
      ["TTM Yield", current.kpi.ttmYield, proposed.kpi.ttmYield, true, (v) => pctv(v, 2)],
      ["Blended Expense", current.kpi.expenseRatio, proposed.kpi.expenseRatio, false, (v) => pctv(v, 2)],
      ["Tax Efficiency (0-100)", current.taxScore, proposed.taxScore, true, (v) => (v == null ? "-" : String(v))],
    ] : [];

  // Verdict bullets
  const verdict: string[] = [];
  if (current && proposed) {
    const cheaper = current.kpi.expenseRatio != null && proposed.kpi.expenseRatio != null && proposed.kpi.expenseRatio < current.kpi.expenseRatio;
    if (cheaper) verdict.push(`Proposed is cheaper - ${pctv(proposed.kpi.expenseRatio, 2)} vs ${pctv(current.kpi.expenseRatio, 2)} blended expense.`);
    const betterSharpe = current.kpi.sharpe3y != null && proposed.kpi.sharpe3y != null && proposed.kpi.sharpe3y > current.kpi.sharpe3y;
    if (betterSharpe) verdict.push(`Better risk-adjusted return - Sharpe ${num2(proposed.kpi.sharpe3y)} vs ${num2(current.kpi.sharpe3y)}.`);
    const betterTax = current.taxScore != null && proposed.taxScore != null && proposed.taxScore > current.taxScore;
    if (betterTax) verdict.push(`More tax-efficient holdings (${proposed.taxScore} vs ${current.taxScore}) - and the Builder places each fund in the right account for further tax savings.`);
    const shallower = current.kpi.maxDrawdown3y != null && proposed.kpi.maxDrawdown3y != null && proposed.kpi.maxDrawdown3y > current.kpi.maxDrawdown3y;
    if (shallower) verdict.push(`Shallower worst-case drawdown - ${pctv(proposed.kpi.maxDrawdown3y)} vs ${pctv(current.kpi.maxDrawdown3y)}.`);
    if (!verdict.length) verdict.push("The current holdings already grade out well on the metrics we could pull. Differences are marginal.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1000 }}>
      <div>
        <h2 style={{ ...ui, fontSize: 22, fontWeight: 300, color: T.text, margin: 0,
          fontFamily: "'Cormorant Garamond', Georgia, serif" }}>Portfolio Compare</h2>
        <p style={{ fontSize: 12.5, color: T.dim, marginTop: 4, ...ui }}>
          Put a client&apos;s current holdings up against the proposed model - trailing returns, risk,
          cost, and tax efficiency, side by side.
        </p>
      </div>

      {/* Client + holdings */}
      <Card>
        <div style={{ padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.06em" }}>Client</span>
            <select value={draft.id} onChange={(e) => selectClient(e.target.value)} style={{ ...inputStyle, minWidth: 180 }}>
              {clients.length === 0 && <option value={draft.id}>No clients yet</option>}
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name || "Untitled"}</option>)}
            </select>
            <span style={{ fontSize: 11, color: T.dim, ...ui }}>Build a client in Portfolio Builder first, then compare here.</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: T.dim, ...mono }}>Holdings: <b style={{ color: T.text }}>{money(totalHoldings(draft))}</b></span>
          </div>

          <div style={{ marginTop: 14 }}>
            <Label>Current Holdings</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
              {draft.holdings.length === 0 && (
                <span style={{ fontSize: 12, color: T.muted, ...ui }}>No holdings yet - add the funds this client owns today.</span>
              )}
              {draft.holdings.map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input style={{ ...inputStyle, width: 110, ...mono }} placeholder="TICKER" value={h.ticker}
                    onChange={(e) => setHolding(i, "ticker", e.target.value)} />
                  <input style={{ ...inputStyle, width: 130 }} type="number" placeholder="$ value" value={h.value || ""}
                    onChange={(e) => setHolding(i, "value", e.target.value)} />
                  <button onClick={() => removeHolding(i)} style={{ width: 24, height: 24, borderRadius: "50%",
                    background: "transparent", border: `1px solid ${T.line2}`, color: T.muted, cursor: "pointer" }}>&times;</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
              <Btn small onClick={addHolding}>+ Add holding</Btn>
              <div style={{ display: "inline-flex", border: `1px solid ${T.line2}`, borderRadius: 8, overflow: "hidden" }}>
                {(["ETF", "Mutual Fund"] as Vehicle[]).map((v) => (
                  <button key={v} onClick={() => setVehicle(v)} style={{ padding: "6px 14px", fontSize: 12, ...ui,
                    cursor: "pointer", border: "none", background: vehicle === v ? T.text : "transparent",
                    color: vehicle === v ? T.bg : T.dim, fontWeight: 600 }}>{v}</button>
                ))}
              </div>
              <Btn accent onClick={run}>{loading ? "Comparing..." : "Compare -&gt;"}</Btn>
            </div>
          </div>
        </div>
      </Card>

      {/* Results */}
      {ran && !loading && (
        <Card>
          <div style={{ padding: "18px 20px" }}>
            {!proposed && <div style={{ fontSize: 12, color: T.muted, ...ui }}>Could not pull enough data to compare right now.</div>}
            {!current && proposed && (
              <div style={{ fontSize: 12, color: T.amber, ...ui, marginBottom: 12 }}>
                No current holdings entered (or none returned data) - showing the proposed model only.
              </div>
            )}
            {proposed && (
              <>
                {/* Header row */}
                <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.7fr", gap: 10,
                  paddingBottom: 8, borderBottom: `1px solid ${T.line}` }}>
                  <span />
                  <span style={{ fontSize: 11, color: T.dim, ...ui, fontWeight: 600, textAlign: "right" }}>Current</span>
                  <span style={{ fontSize: 11, color: T.text, ...ui, fontWeight: 600, textAlign: "right" }}>Proposed</span>
                  <span style={{ fontSize: 11, color: T.muted, ...ui, fontWeight: 600, textAlign: "right" }}>Better</span>
                </div>
                {rows.map(([label, cv, pv, hib, fmt]) => {
                  const better = cv != null && pv != null ? (hib ? (pv > cv ? "P" : pv < cv ? "C" : "=") : (pv < cv ? "P" : pv > cv ? "C" : "=")) : "-";
                  return (
                    <div key={label} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.7fr", gap: 10,
                      alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${T.line}` }}>
                      <span style={{ fontSize: 12.5, color: T.dim, ...ui }}>{label}</span>
                      <span style={{ fontSize: 13, color: T.text, ...mono, textAlign: "right" }}>{fmt(cv)}</span>
                      <span style={{ fontSize: 13, color: T.text, ...mono, textAlign: "right", fontWeight: 600 }}>{fmt(pv)}</span>
                      <span style={{ fontSize: 12, textAlign: "right", ...mono, fontWeight: 700,
                        color: better === "P" ? T.green : better === "C" ? T.amber : T.muted }}>
                        {better === "P" ? "Proposed" : better === "C" ? "Current" : "-"}
                      </span>
                    </div>
                  );
                })}

                {/* Verdict */}
                {verdict.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <Label>What Changes</Label>
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                      {verdict.map((t, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span style={{ color: T.green, fontSize: 12, lineHeight: 1.5 }}>&#9650;</span>
                          <span style={{ fontSize: 11.5, color: T.dim, ...ui, lineHeight: 1.5 }}>{t}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
