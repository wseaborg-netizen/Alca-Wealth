"use client";
import React, { useEffect, useState, useCallback } from "react";
import { T, ui, mono } from "./tokens";
import { Card, Label, Btn, PageHeader } from "./ui";
import type { FundRecord } from "../lib/funds";

const KEY = "tool_murderboard_v1";

interface NewsItem { uuid: string; title: string; publisher: string; link: string; publishedAt: number; }

const pctv = (v: number | null, d = 1) => (v == null ? "-" : `${v.toFixed(d)}%`);
const num2 = (v: number | null) => (v == null ? "-" : v.toFixed(2));

function timeAgo(unixSec: number): string {
  if (!unixSec) return "";
  const s = Date.now() / 1000 - unixSec;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
function fmtDate(unixSec: number): string {
  if (!unixSec) return "";
  return new Date(unixSec * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function assetClassOf(category: string): string {
  const c = (category || "").toLowerCase();
  if (/bond|income|fixed|treasury|muni|tips|credit|ultrashort|preferred/.test(c)) return "Fixed Income";
  if (/international|emerging|world|global|foreign/.test(c)) return "International";
  if (/real estate|reit/.test(c)) return "Real Estate";
  if (/commodit|gold|alternative/.test(c)) return "Alternatives";
  return "US Equity";
}
const CORE_CLASSES = ["US Equity", "International", "Fixed Income"];
const CLASS_FUND: Record<string, { ticker: string; name: string }> = {
  "US Equity": { ticker: "VTI", name: "Vanguard Total Stock Market ETF" },
  "International": { ticker: "VXUS", name: "Vanguard Total International Stock ETF" },
  "Fixed Income": { ticker: "BND", name: "Vanguard Total Bond Market ETF" },
};

function loadBoard(): string[] {
  if (typeof window === "undefined") return [];
  try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveBoard(list: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* noop */ }
}

export default function MurderBoardTab({ onAnalyze, onFindSimilar }: {
  onAnalyze?: (t: string) => void;
  onFindSimilar?: (t: string) => void;
} = {}) {
  const [tickers, setTickers] = useState<string[]>([]);
  const [funds, setFunds] = useState<Record<string, FundRecord | null>>({});
  const [news, setNews] = useState<Record<string, NewsItem[]>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const loadFund = useCallback(async (t: string) => {
    try {
      const [fr, nr] = await Promise.all([
        fetch(`/api/funds/${t}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/news/ticker?q=${encodeURIComponent(t)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      setFunds((f) => ({ ...f, [t]: fr && !fr.error ? fr : null }));
      setNews((n) => ({ ...n, [t]: (nr?.items ?? []) as NewsItem[] }));
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    const list = loadBoard();
    setTickers(list);
    list.forEach((t) => void loadFund(t));
  }, [loadFund]);

  const add = async () => {
    const t = input.trim().toUpperCase();
    if (!t) return;
    if (tickers.includes(t)) { setErr(`${t} is already on the board`); return; }
    setErr(""); setBusy(t);
    const next = [...tickers, t];
    setTickers(next); saveBoard(next); setInput("");
    await loadFund(t);
    setBusy(null);
  };
  const remove = (t: string) => {
    const next = tickers.filter((x) => x !== t);
    setTickers(next); saveBoard(next);
  };

  // Merged, most-recent-first news across all board funds
  const feed = tickers
    .flatMap((t) => (news[t] ?? []).map((n) => ({ ...n, ticker: t })))
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 14);

  // Gap analysis
  const coveredClasses = new Set(
    tickers.map((t) => funds[t]).filter(Boolean).map((f) => assetClassOf(f!.category))
  );
  const missing = CORE_CLASSES.filter((c) => !coveredClasses.has(c));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1080 }}>
      <PageHeader title="Portfolio Review"
        subtitle="Review the funds in a client's portfolio - track them, watch the news, and surface gaps or better alternatives." />

      {/* Add */}
      <Card>
        <div style={{ padding: "14px 18px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add a fund, e.g. AGTHX"
            style={{ background: T.panel3, border: `1px solid ${T.line2}`, borderRadius: 7,
              padding: "8px 12px", color: T.text, fontSize: 13, ...mono, outline: "none", width: 200 }} />
          <Btn accent onClick={add}>{busy ? "Adding..." : "+ Add fund"}</Btn>
          {err && <span style={{ fontSize: 11.5, color: T.red, ...ui }}>{err}</span>}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: T.dim, ...mono }}>{tickers.length} on board</span>
        </div>
      </Card>

      {tickers.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: T.muted, fontSize: 13, ...ui }}>
          Add the funds you actively use to start your board.
        </div>
      )}

      {/* Fund cards */}
      {tickers.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {tickers.map((t) => {
            const f = funds[t];
            const n = news[t] ?? [];
            return (
              <div key={t} style={{ border: `1px solid ${T.line}`, borderRadius: 10, background: T.panel, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: T.text, ...mono }}>{t}</span>
                      {n.length > 0 && (
                        <span style={{ fontSize: 9.5, color: T.data, background: `${T.data}18`, borderRadius: 10,
                          padding: "1px 7px", ...ui, fontWeight: 600 }}>{n.length} news</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: T.dim, ...ui, whiteSpace: "nowrap", overflow: "hidden",
                      textOverflow: "ellipsis", maxWidth: 300 }}>{f?.name ?? (funds[t] === null ? "No data" : "Loading...")}</div>
                    {f && <div style={{ fontSize: 10, color: T.muted, ...ui, marginTop: 1 }}>{f.category} &middot; {f.vehicle}</div>}
                  </div>
                  <button onClick={() => remove(t)} style={{ width: 22, height: 22, borderRadius: "50%",
                    background: "transparent", border: `1px solid ${T.line2}`, color: T.muted, cursor: "pointer", flexShrink: 0 }}>&times;</button>
                </div>
                {f && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 12 }}>
                    {([
                      ["1Y", pctv(f.kpi.return1y)],
                      ["Sharpe", num2(f.kpi.sharpe3y)],
                      ["Yield", pctv(f.kpi.ttmYield, 2)],
                      ["Expense", f.expenseRatio != null ? pctv(f.expenseRatio, 2) : "-"],
                    ] as [string, string][]).map(([l, v]) => (
                      <div key={l}>
                        <div style={{ fontSize: 9, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
                        <div style={{ fontSize: 13, color: T.text, ...mono, fontWeight: 600 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  {onAnalyze && <Btn small onClick={() => onAnalyze(t)}>Analyze</Btn>}
                  {onFindSimilar && <Btn small onClick={() => onFindSimilar(t)}>Find similar</Btn>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Suggestions - gap analysis */}
      {tickers.length > 0 && (
        <Card>
          <div style={{ padding: "16px 20px" }}>
            <Label>Suggestions - Based on What You Hold</Label>
            {missing.length === 0 ? (
              <div style={{ fontSize: 12.5, color: T.dim, ...ui, marginTop: 10 }}>
                Your board covers the core asset classes (US equity, international, and fixed income).
                Use &quot;Find similar&quot; on any card to hunt for cheaper or higher-quality swaps.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: T.dim, ...ui, marginTop: 8, marginBottom: 10 }}>
                  Your board is missing exposure to {missing.length} core asset class{missing.length > 1 ? "es" : ""}. Consider adding:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {missing.map((c) => {
                    const rec = CLASS_FUND[c];
                    return (
                      <div key={c} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 13px",
                        background: T.panel3, border: `1px solid ${T.line}`, borderRadius: 8 }}>
                        <span style={{ fontSize: 11, color: T.amber, ...ui, fontWeight: 600, width: 110 }}>{c}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, ...mono, width: 60 }}>{rec.ticker}</span>
                        <span style={{ fontSize: 11.5, color: T.dim, ...ui, flex: 1 }}>{rec.name}</span>
                        <Btn small onClick={() => { setInput(rec.ticker); }}>Add</Btn>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {/* News alerts feed */}
      {feed.length > 0 && (
        <Card>
          <div style={{ padding: "16px 20px" }}>
            <Label>News Alerts - Your Funds</Label>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column" }}>
              {feed.map((n) => (
                <div key={n.uuid + n.ticker} onClick={() => window.open(n.link, "_blank", "noopener,noreferrer")}
                  style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "10px 0",
                    borderBottom: `1px solid ${T.line}`, cursor: "pointer" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.data, ...mono, width: 54, flexShrink: 0 }}>{n.ticker}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: T.text, ...ui, lineHeight: 1.4 }}>{n.title}</div>
                    <div style={{ fontSize: 10.5, color: T.muted, ...ui, marginTop: 2 }}>
                      {n.publisher}
                      {n.publishedAt ? <> &middot; <b style={{ color: T.dim, fontWeight: 600 }}>{fmtDate(n.publishedAt)}</b> &middot; {timeAgo(n.publishedAt)}</> : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
