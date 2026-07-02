"use client";
import React, { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { T, ui, mono, chartTooltip } from "./tokens";
import { Btn, Label, Card, Spinner, ErrBanner, KPI } from "./ui";
import type { FundRecord } from "../lib/funds";
import { analyzeFund } from "../lib/analysis";
import { computeTaxEfficiency } from "../lib/tax";

const pct = (v: number | null, d = 2) => (v == null ? "-" : `${v.toFixed(d)}%`);
const num = (v: number | null, d = 2) => (v == null ? "-" : v.toFixed(d));

interface TickerNews { uuid: string; title: string; publisher: string; link: string; publishedAt: number; image: string }

function timeAgo(ts: number): string {
  if (!ts) return "";
  const mins = Math.floor((Date.now() / 1000 - ts) / 60);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

/** Overall rating derived from the heuristic pros/cons net score. */
function overallRating(net: number): { score: number; grade: string; color: string; worth: string } {
  const score = Math.round(Math.max(6, Math.min(97, 50 + net * 6.5)));
  const grade = score >= 80 ? "A" : score >= 67 ? "B" : score >= 52 ? "C" : score >= 38 ? "D" : "E";
  const color = score >= 67 ? T.green : score >= 52 ? T.amber : T.red;
  const worth =
    net >= 3 ? "Worth it - strong across the numbers."
    : net >= 1 ? "Worth a look - more strengths than watch-outs."
    : net <= -3 ? "Hard to justify - the watch-outs outweigh."
    : net <= -1 ? "Be selective - mixed signals here."
    : "Neutral - depends on the role it plays.";
  return { score, grade, color, worth };
}

function equityStyle(category: string): string | null {
  const m = category.match(/US Equity (Large|Mid|Small|Mid\/Small|Small\/Mid)\s+(Value|Blend|Growth)/i);
  return m ? `${m[1]} ${m[2]}` : null;
}

const ratingColors: Record<string, string> = { A: T.green, B: "#16A34A", C: T.amber, D: T.red };
const ratingBg: Record<string, string> = { A: "#DCFCE7", B: "#F0FDF4", C: "#FEF9C3", D: "#FEF2F2" };

export default function AnalysisTab({
  ticker, setTicker, onCompare, onFindSimilar,
}: {
  ticker: string;
  setTicker: (t: string) => void;
  onCompare?: (t: string) => void;
  onFindSimilar?: (t: string) => void;
}) {
  const [input, setInput] = useState(ticker);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [record, setRecord] = useState<FundRecord | null>(null);
  const [news, setNews] = useState<TickerNews[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  const run = async (raw: string) => {
    const t = raw.trim().toUpperCase();
    if (!t) return;
    setLoading(true); setError(""); setRecord(null); setNews([]);
    setTicker(t);
    // Pull related news in parallel (non-blocking for the main analysis)
    setNewsLoading(true);
    fetch(`/api/news/ticker?q=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d) => setNews(d.items ?? []))
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false));
    try {
      const res = await fetch(`/api/funds/${t}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `${t} not found`);
      setRecord(data);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  };

  // Auto-run when a ticker is pushed in from another tab (Analyze quick-action)
  useEffect(() => {
    if (ticker && ticker !== record?.ticker) {
      setInput(ticker);
      run(ticker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  const a = record ? analyzeFund(record) : null;
  const tax = record ? computeTaxEfficiency(record) : null;
  const style = record ? equityStyle(record.category) : null;

  const k = record?.kpi;
  const metrics = k && record ? [
    { label: "1Y Return", value: pct(k.return1y), good: k.return1y != null ? k.return1y > 0 : null },
    { label: "3Y Return", value: pct(k.return3y), good: k.return3y != null ? k.return3y > 0 : null },
    { label: "5Y Return", value: pct(k.return5y), good: k.return5y != null ? k.return5y > 0 : null },
    { label: "Sharpe 3Y", value: num(k.sharpe3y), good: k.sharpe3y != null ? k.sharpe3y >= 1 : null },
    { label: "Sortino 3Y", value: num(k.sortino3y), good: k.sortino3y != null ? k.sortino3y >= 1 : null },
    { label: "Alpha 3Y", value: pct(k.alpha3y), good: k.alpha3y != null ? k.alpha3y > 0 : null },
    { label: "Beta 3Y", value: num(k.beta3y), good: k.beta3y != null ? k.beta3y <= 1.1 : null },
    { label: "Max DD 3Y", value: pct(k.maxDrawdown3y, 1), good: k.maxDrawdown3y != null ? k.maxDrawdown3y > -20 : null },
    { label: "Std Dev 3Y", value: pct(k.stdDev3y, 1), good: null },
    { label: "Up Capture", value: num(k.upsideCapture3y, 1), good: k.upsideCapture3y != null ? k.upsideCapture3y >= 100 : null },
    { label: "Down Capture", value: num(k.downsideCapture3y, 1), good: k.downsideCapture3y != null ? k.downsideCapture3y < 100 : null },
    { label: "TTM Yield", value: pct(k.ttmYield), good: k.ttmYield != null ? k.ttmYield > 0 : null },
    { label: "Expense", value: record.expenseRatio != null ? pct(record.expenseRatio) : "-", good: record.expenseRatio != null ? record.expenseRatio <= 0.5 : null },
    { label: "AUM", value: record.aumFormatted, good: null },
    { label: "Fund Age", value: record.fundAge != null ? `${record.fundAge.toFixed(1)} yr` : "-", good: record.fundAge != null ? record.fundAge >= 5 : null },
    { label: "Batting Avg", value: pct(k.battingAvg3y, 0), good: k.battingAvg3y != null ? k.battingAvg3y >= 50 : null },
  ] : [];

  const rolling = (k?.rolling3y ?? []).map((p) => ({
    date: p.date, Fund: p.fundReturn, Benchmark: p.benchReturn,
  }));
  const stress = k?.stressTests ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header / input */}
      <div>
        <h2 style={{ fontSize: 26, fontWeight: 300, color: T.text, margin: 0,
          fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>Critical Analysis</h2>
        <p style={{ fontSize: 12, color: T.dim, marginTop: 4, ...ui }}>
          A full rundown of one fund - strengths, weaknesses, and the current numbers behind them.
        </p>
      </div>

      <Card style={{ padding: "18px 22px" }}>
        <Label>Fund ticker</Label>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && run(input)}
            placeholder="Enter a ticker - e.g. SCHD, FXAIX, VTI"
            style={{ flex: 1, background: T.panel, color: T.text, border: `1px solid ${T.line2}`,
              borderRadius: 6, padding: "9px 12px", fontSize: 14, outline: "none", ...mono }} />
          <Btn accent onClick={() => run(input)} disabled={loading || !input.trim()}>
            {loading ? "Analyzing…" : "Run Analysis"}
          </Btn>
          <Btn onClick={() => { setInput(""); setRecord(null); setError(""); setTicker(""); }}
            disabled={loading || (!input && !record)}>Clear</Btn>
        </div>
      </Card>

      {loading && <Spinner label="Pulling the latest data…" />}
      <ErrBanner msg={error} />

      {record && a && (
        <>
          {/* Identity + actions */}
          <Card style={{ padding: "18px 22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 24, fontWeight: 600, color: T.text, ...mono }}>{record.ticker}</span>
                  <span style={{ fontSize: 13, color: T.dim, ...ui }}>{record.name}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: T.muted, background: T.panel2, border: `1px solid ${T.line}`,
                    borderRadius: 3, padding: "2px 7px", ...ui }}>{record.vehicle}</span>
                  {style && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", background: T.data,
                      borderRadius: 3, padding: "2px 8px", ...ui }}>{style}</span>
                  )}
                  <span style={{ fontSize: 11, color: T.muted, ...ui }}>{record.category}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {onCompare && <Btn small onClick={() => onCompare(record.ticker)}>Compare this</Btn>}
                {onFindSimilar && <Btn small onClick={() => onFindSimilar(record.ticker)}>Find similar</Btn>}
              </div>
            </div>

            {/* Overall rating + bottom line */}
            {(() => {
              const r = overallRating(a.net);
              return (
                <div style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "stretch", flexWrap: "wrap" }}>
                  {/* Overall score dial */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                    borderRadius: 10, background: T.panel2, border: `1px solid ${T.line}`, flexShrink: 0 }}>
                    <div style={{ position: "relative", width: 58, height: 58, flexShrink: 0 }}>
                      <svg width="58" height="58" viewBox="0 0 58 58">
                        <circle cx="29" cy="29" r="25" fill="none" stroke={T.line} strokeWidth="6" />
                        <circle cx="29" cy="29" r="25" fill="none" stroke={r.color} strokeWidth="6"
                          strokeLinecap="round" strokeDasharray={`${(r.score / 100) * 157} 157`}
                          transform="rotate(-90 29 29)" />
                      </svg>
                      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 17, fontWeight: 600, color: r.color, lineHeight: 1, ...mono }}>{r.score}</span>
                        <span style={{ fontSize: 8, color: T.muted, ...ui }}>/100</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 600, color: T.dim, textTransform: "uppercase",
                        letterSpacing: "0.1em", ...ui }}>Overall rating</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 3 }}>
                        <span style={{ fontSize: 26, fontWeight: 600, color: r.color, lineHeight: 1, ...mono }}>{r.grade}</span>
                        <span style={{ fontSize: 11, color: T.dim, ...ui }}>{a.pros.length}▲ / {a.cons.length}▼</span>
                      </div>
                    </div>
                  </div>
                  {/* Bottom line + worth-it */}
                  <div style={{ flex: 1, minWidth: 240, padding: "12px 14px", borderRadius: 10,
                    background: a.net >= 2 ? "#F0FDF4" : a.net <= -2 ? "#FEF2F2" : T.panel2,
                    border: `1px solid ${a.net >= 2 ? "#BBF7D0" : a.net <= -2 ? "#FECACA" : T.line}` }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: T.dim, textTransform: "uppercase",
                      letterSpacing: "0.1em", ...ui, marginBottom: 4 }}>Is it worth it?</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: r.color, ...ui, marginBottom: 6 }}>{r.worth}</div>
                    <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.6, ...ui }}>{a.bottomLine}</div>
                  </div>
                </div>
              );
            })()}
          </Card>

          {/* Pros / Cons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Card style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.green, ...ui, marginBottom: 10,
                display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>▲</span> Strengths
              </div>
              {a.pros.length ? a.pros.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                  <span style={{ color: T.green, fontWeight: 600, flexShrink: 0 }}>+</span>
                  <span style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.55, ...ui }}>{p}</span>
                </div>
              )) : <div style={{ fontSize: 12, color: T.muted, ...ui }}>No standout strengths in the data.</div>}
            </Card>
            <Card style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.red, ...ui, marginBottom: 10,
                display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>▼</span> Watch-outs
              </div>
              {a.cons.length ? a.cons.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                  <span style={{ color: T.red, fontWeight: 600, flexShrink: 0 }}>−</span>
                  <span style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.55, ...ui }}>{c}</span>
                </div>
              )) : <div style={{ fontSize: 12, color: T.muted, ...ui }}>No notable red flags in the data.</div>}
            </Card>
          </div>

          {/* Current data */}
          <Card style={{ padding: "18px 22px" }}>
            <Label>Current data</Label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "16px 12px", marginTop: 12 }}>
              {metrics.map((m) => (
                <KPI key={m.label} label={m.label} value={m.value} good={m.good} />
              ))}
            </div>
          </Card>

          {/* Tax efficiency + rolling chart */}
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14, alignItems: "stretch" }}>
            {tax && (
              <Card style={{ padding: "18px 20px" }}>
                <Label>Tax efficiency</Label>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
                  <div style={{ width: 54, height: 54, borderRadius: 12, flexShrink: 0,
                    background: ratingBg[tax.rating], border: `1px solid ${ratingColors[tax.rating]}44`,
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 28, fontWeight: 600, color: ratingColors[tax.rating], ...mono }}>{tax.rating}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text, ...ui }}>{tax.ratingLabel}</div>
                    <div style={{ fontSize: 11, color: T.dim, marginTop: 1, ...ui }}>Tax drag {tax.dragEstimate}</div>
                  </div>
                </div>
                <div style={{ marginTop: 12, padding: "9px 11px", background: T.panel2,
                  border: `1px solid ${T.line}`, borderRadius: 7 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text, ...ui }}>{tax.accountRec}</div>
                  <div style={{ fontSize: 11, color: T.dim, marginTop: 3, lineHeight: 1.5, ...ui }}>{tax.accountDetail}</div>
                </div>
              </Card>
            )}

            <Card style={{ padding: "16px 20px" }}>
              <Label>Growth vs benchmark - 3 years</Label>
              {rolling.length > 1 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={rolling} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke={T.line} vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: T.muted, fontSize: 9, fontFamily: "Geist" }}
                      axisLine={false} tickLine={false} minTickGap={40} />
                    <YAxis tick={{ fill: T.muted, fontSize: 9 }} axisLine={false} tickLine={false}
                      tickFormatter={(v: number) => `${v}%`} />
                    <Tooltip {...chartTooltip} formatter={(v: unknown) => `${(v as number)?.toFixed?.(1) ?? v}%`} />
                    <Line type="monotone" dataKey="Fund" stroke={T.data} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="Benchmark" stroke={T.muted} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center",
                  color: T.muted, fontSize: 12, ...ui }}>No rolling-return history available.</div>
              )}
            </Card>
          </div>

          {/* Stress periods */}
          {stress.length > 0 && (
            <Card style={{ padding: "16px 20px" }}>
              <Label>How it held up in past stress periods</Label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 12 }}>
                {stress.map((s) => (
                  <div key={s.label} style={{ background: T.panel2, border: `1px solid ${T.line}`,
                    borderRadius: 7, padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: T.dim, fontWeight: 600, letterSpacing: "0.06em",
                      ...ui, marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, ...mono,
                      color: s.fundReturn == null ? T.dim : s.fundReturn >= 0 ? T.green : T.red }}>
                      {s.fundReturn != null ? `${s.fundReturn > 0 ? "+" : ""}${s.fundReturn.toFixed(1)}%` : "-"}
                    </div>
                    {s.benchReturn != null && (
                      <div style={{ fontSize: 10, color: T.muted, marginTop: 2, ...mono }}>
                        bench {s.benchReturn > 0 ? "+" : ""}{s.benchReturn.toFixed(1)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* News & coverage */}
          <Card style={{ padding: "16px 20px" }}>
            <Label>News &amp; coverage - recent articles mentioning {record.ticker}</Label>
            {newsLoading ? (
              <div style={{ fontSize: 12, color: T.muted, ...ui, padding: "16px 0" }}>Pulling related coverage…</div>
            ) : news.length === 0 ? (
              <div style={{ fontSize: 12, color: T.muted, ...ui, padding: "12px 0" }}>
                No recent articles found for {record.ticker}. Extra context only - the rating above is data-driven.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginTop: 12 }}>
                {news.map((n) => (
                  <div key={n.uuid} onClick={() => window.open(n.link, "_blank", "noopener,noreferrer")}
                    style={{ display: "flex", gap: 11, alignItems: "center", cursor: "pointer",
                      background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 8, padding: "10px 12px" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.blue)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}>
                    {n.image && (
                      <img src={n.image} alt="" loading="lazy" referrerPolicy="no-referrer"
                        style={{ width: 46, height: 46, borderRadius: 6, objectFit: "cover", flexShrink: 0, background: T.panel3 }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: T.text, lineHeight: 1.4, ...ui,
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"], overflow: "hidden" }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: 10, color: T.muted, marginTop: 3, ...ui }}>
                        {n.publisher}{n.publishedAt ? ` · ${timeAgo(n.publishedAt)}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <p style={{ fontSize: 10, color: T.muted, ...ui, textAlign: "center" }}>
            Research aid · data delayed &amp; unofficial · verify in your firm&apos;s system before client use
          </p>
        </>
      )}
    </div>
  );
}
