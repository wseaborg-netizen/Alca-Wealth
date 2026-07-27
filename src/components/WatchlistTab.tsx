"use client";
import React, { useState, useEffect, useCallback } from "react";
import { T, ui, mono } from "./tokens";
import type { FundRecord } from "@/lib/market-data/fundService";

// ── Types ──────────────────────────────────────────────────────────────────────

export type FactorChip = "alpha" | "cost" | "drawdown" | "yield";

interface WatchlistTabProps {
  onAddToCompare: (ticker: string) => void;
  onAnalyze: (ticker: string) => void;
  onDiscover: (mode: "find") => void;
  authMode?: "full" | "preview" | "none" | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LS_KEY = "lynx_watchlist_v1";

const CHIPS: { id: FactorChip; label: string; icon: string; desc: string; action: "compare" | "analysis" }[] = [
  { id: "alpha",    label: "Increase alpha",    icon: "↑", desc: "Find higher-alpha alternatives",   action: "analysis" },
  { id: "cost",     label: "Lower cost",         icon: "$", desc: "Find cheaper funds in category",   action: "compare"  },
  { id: "drawdown", label: "Reduce drawdown",    icon: "▼", desc: "Find lower-risk alternatives",     action: "compare"  },
  { id: "yield",    label: "More yield",         icon: "◎", desc: "Find higher-yield alternatives",   action: "compare"  },
];

const CHIP_COLORS: Record<FactorChip, { bg: string; text: string; border: string }> = {
  alpha:    { bg: "#F0FDF4", text: "#166534", border: "#86EFAC" },
  cost:     { bg: "#EFF6FF", text: "#1E40AF", border: "#93C5FD" },
  drawdown: { bg: "#FFF7ED", text: "#9A3412", border: "#FDC284" },
  yield:    { bg: "#F5F3FF", text: "#5B21B6", border: "#C4B5FD" },
};

// Dark-mode friendly chip colors (darker backgrounds)
const CHIP_COLORS_DARK: Record<FactorChip, { bg: string; text: string; border: string }> = {
  alpha:    { bg: "#14532D22", text: "#86EFAC", border: "#166534" },
  cost:     { bg: "#1E3A5F22", text: "#93C5FD", border: "#1E40AF" },
  drawdown: { bg: "#7C2D1222", text: "#FDC284", border: "#9A3412" },
  yield:    { bg: "#3B0764 22", text: "#C4B5FD", border: "#5B21B6" },
};

// ── Formatters ─────────────────────────────────────────────────────────────────

const fmtPct = (v: number | null | undefined, decimals = 1) =>
  v == null ? "-" : (v >= 0 ? "+" : "") + v.toFixed(decimals) + "%";
const fmtNum = (v: number | null | undefined, dec = 2) =>
  v == null ? "-" : v.toFixed(dec);
const col = (v: number | null | undefined) =>
  v == null ? T.muted : v >= 0 ? T.green : T.red;

// ── Sparkline ─────────────────────────────────────────────────────────────────

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return <span style={{ color: T.muted, fontSize: 11 }}>-</span>;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 60, H = 22;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const lastUp = data[data.length - 1] >= data[0];
  const c = lastUp ? T.green : T.red;
  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={c} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Row skeleton ──────────────────────────────────────────────────────────────

function RowSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 80px 90px 80px 72px 72px 72px 1fr", gap: 0,
      padding: "14px 16px", borderBottom: `1px solid ${T.line}`, alignItems: "center" }}>
      {[180, 60, 70, 60, 50, 50, 50, 140].map((w, i) => (
        <div key={i} style={{ height: 12, width: w, borderRadius: 4,
          background: "var(--c-line2)", opacity: 0.6, animation: "pulse 1.4s ease-in-out infinite",
          animationDelay: `${i * 0.08}s` }} />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.9} }`}</style>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WatchlistTab({ onAddToCompare, onAnalyze, onDiscover, authMode }: WatchlistTabProps) {
  const [tickers, setTickers] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, FundRecord | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [addInput, setAddInput] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Detect theme for chip colors
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  // Load persisted tickers - from Supabase if full account, else localStorage
  useEffect(() => {
    if (authMode === "full") {
      fetch("/api/watchlist")
        .then(r => r.json())
        .then(({ tickers: saved }) => { if (Array.isArray(saved) && saved.length) setTickers(saved); })
        .catch(() => {});
    } else {
      try {
        const saved = localStorage.getItem(LS_KEY);
        if (saved) setTickers(JSON.parse(saved));
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode]);

  // Persist tickers - localStorage only (Supabase is updated on add/remove)
  useEffect(() => {
    if (authMode !== "full") {
      try { localStorage.setItem(LS_KEY, JSON.stringify(tickers)); } catch {}
    }
  }, [tickers, authMode]);

  // Fetch data for a single ticker
  const fetchFund = useCallback(async (ticker: string) => {
    if (data[ticker] !== undefined) return; // already fetched / in flight
    setLoading((prev) => ({ ...prev, [ticker]: true }));
    try {
      const res = await fetch(`/api/funds/${ticker}`);
      const json = await res.json();
      setData((prev) => ({ ...prev, [ticker]: res.ok ? json : null }));
    } catch {
      setData((prev) => ({ ...prev, [ticker]: null }));
    } finally {
      setLoading((prev) => ({ ...prev, [ticker]: false }));
    }
  }, [data]);

  // Fetch on ticker list change
  useEffect(() => {
    for (const t of tickers) fetchFund(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers]);

  const addFund = async () => {
    const t = addInput.trim().toUpperCase();
    if (!t) return;
    if (tickers.includes(t)) { setAddError("Already on watchlist"); return; }
    setAdding(true); setAddError("");
    try {
      const res = await fetch(`/api/funds/${t}`);
      if (!res.ok) { setAddError(`Ticker "${t}" not found`); return; }
      const json = await res.json();
      setData((prev) => ({ ...prev, [t]: json }));
      setTickers((prev) => [...prev, t]);
      setAddInput("");
      // Sync to Supabase if full account
      if (authMode === "full") {
        fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: t }) }).catch(() => {});
      }
    } catch {
      setAddError("Fetch failed - try again");
    } finally {
      setAdding(false);
    }
  };

  const removeFund = (ticker: string) => {
    setTickers((prev) => prev.filter((t) => t !== ticker));
    setData((prev) => { const next = { ...prev }; delete next[ticker]; return next; });
    // Sync removal to Supabase if full account
    if (authMode === "full") {
      fetch("/api/watchlist", { method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }) }).catch(() => {});
    }
  };

  const handleChip = (ticker: string, chip: FactorChip) => {
    if (chip === "alpha") {
      onAnalyze(ticker);
    } else {
      onAddToCompare(ticker);
    }
  };

  const chipColors = isDark ? CHIP_COLORS_DARK : CHIP_COLORS;

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (tickers.length === 0) {
    return (
      <div style={{ maxWidth: 820 }}>
        <PageHeader />
        <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14,
          padding: "56px 40px", textAlign: "center", marginTop: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: T.panel2,
            border: `1px solid ${T.line2}`, display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 18px", color: T.muted }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 2l2.9 6 6.1.9-4.5 4.3 1.1 6.1L12 16.2l-5.6 3.1 1.1-6.1L3 9l6.1-.9L12 2z"
                stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.text, ...ui, marginBottom: 8 }}>
            Your watchlist is empty
          </div>
          <div style={{ fontSize: 13, color: T.dim, ...ui, lineHeight: 1.6, maxWidth: 360, margin: "0 auto 24px" }}>
            Pin funds you want to track. Each one shows live metrics and smart replacement chips
            so you can swap it out in one click.
          </div>
          <AddInput
            value={addInput} onChange={setAddInput}
            onAdd={addFund} adding={adding} error={addError}
            onClearError={() => setAddError("")}
          />
        </div>
      </div>
    );
  }

  // ── Table ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1080 }}>
      <PageHeader />

      {/* Add row */}
      <div style={{ marginBottom: 16 }}>
        <AddInput
          value={addInput} onChange={setAddInput}
          onAdd={addFund} adding={adding} error={addError}
          onClearError={() => setAddError("")}
        />
      </div>

      {/* Table */}
      <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden" }}>

        {/* Header row */}
        <div style={{ display: "grid",
          gridTemplateColumns: "2fr 80px 88px 72px 68px 68px 220px 36px",
          gap: 0, padding: "9px 16px",
          background: T.panel2, borderBottom: `1px solid ${T.line}` }}>
          {["Fund", "Trend", "1Y Price Chg", "Sharpe 3Y", "ER", "TTM Yield", "Factor Chips", ""].map((h) => (
            <div key={h} style={{ fontSize: 9.5, fontWeight: 600, color: T.muted, textTransform: "uppercase",
              letterSpacing: "0.11em", ...ui, paddingRight: 8 }}>{h}</div>
          ))}
        </div>

        {/* Data rows */}
        {tickers.map((ticker) => {
          const fund = data[ticker];
          const isLoading = loading[ticker];

          if (isLoading || fund === undefined) return <RowSkeleton key={ticker} />;

          if (!fund) return (
            <div key={ticker} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.muted, ...mono }}>{ticker}</span>
                <span style={{ fontSize: 11.5, color: T.muted, ...ui }}>Could not load data</span>
              </div>
              <RemoveBtn onClick={() => removeFund(ticker)} />
            </div>
          );

          const kpi = fund.kpi;
          const sparkData = kpi.rolling3y?.slice(-24).map((d) => d.fundReturn) ?? [];

          return (
            <div key={ticker} style={{ display: "grid",
              gridTemplateColumns: "2fr 80px 88px 72px 68px 68px 220px 36px",
              gap: 0, padding: "13px 16px",
              borderBottom: `1px solid ${T.line}`, alignItems: "center",
              transition: "background 0.1s" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-panel2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {/* Fund name */}
              <div style={{ paddingRight: 12, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, ...mono }}>{ticker}</span>
                  <span style={{ fontSize: 9.5, color: T.muted, background: T.panel3,
                    border: `1px solid ${T.line}`, borderRadius: 4, padding: "1px 6px", ...ui, flexShrink: 0 }}>
                    {fund.vehicle}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: T.dim, marginTop: 2, ...ui,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                  {fund.name}
                </div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 1, ...ui,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {fund.category}
                </div>
              </div>

              {/* Trend sparkline */}
              <div style={{ paddingRight: 8 }}>
                <MiniSparkline data={sparkData} color={T.data} />
              </div>

              {/* 1Y Price Change (Nasdaq-style, dividends excluded) */}
              <div style={{ paddingRight: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: col(kpi.priceChange?.["1Y"] ?? null), ...mono }}>
                  {fmtPct(kpi.priceChange?.["1Y"] ?? null)}
                </div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 1, ...ui }}>1-year</div>
              </div>

              {/* Sharpe */}
              <div style={{ paddingRight: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600,
                  color: kpi.sharpe3y == null ? T.muted : kpi.sharpe3y >= 1 ? T.green : kpi.sharpe3y >= 0.5 ? T.amber : T.red,
                  ...mono }}>
                  {fmtNum(kpi.sharpe3y)}
                </div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 1, ...ui }}>Sharpe</div>
              </div>

              {/* ER */}
              <div style={{ paddingRight: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600,
                  color: fund.expenseRatio == null ? T.muted
                    : fund.expenseRatio < 0.2 ? T.green : fund.expenseRatio < 0.6 ? T.amber : T.red,
                  ...mono }}>
                  {fund.expenseRatio != null ? fund.expenseRatio.toFixed(2) + "%" : "-"}
                </div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 1, ...ui }}>Exp. ratio</div>
              </div>

              {/* Yield */}
              <div style={{ paddingRight: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.data, ...mono }}>
                  {fmtPct(kpi.ttmYield, 2)}
                </div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 1, ...ui }}>TTM yield</div>
              </div>

              {/* Factor chips */}
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", paddingRight: 8 }}>
                {CHIPS.map((chip) => {
                  const c = chipColors[chip.id];
                  return (
                    <button
                      key={chip.id}
                      title={chip.desc}
                      onClick={() => handleChip(ticker, chip.id)}
                      style={{ display: "flex", alignItems: "center", gap: 4,
                        padding: "3px 9px", borderRadius: 20, cursor: "pointer",
                        background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                        fontSize: 10.5, fontWeight: 600, ...ui, whiteSpace: "nowrap",
                        transition: "all 0.12s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.75"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                    >
                      <span style={{ fontSize: 9 }}>{chip.icon}</span>
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              {/* Remove */}
              <RemoveBtn onClick={() => removeFund(ticker)} />
            </div>
          );
        })}

        {/* Footer */}
        <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, color: T.muted, ...ui }}>
            {tickers.length} fund{tickers.length !== 1 ? "s" : ""} · prices delayed · fund data via Tiingo
          </div>
          <button
            onClick={() => { tickers.forEach((t) => { setData((prev) => { const n = { ...prev }; delete n[t]; return n; }); }); tickers.forEach(fetchFund); }}
            style={{ fontSize: 11, color: T.blue, background: "none", border: "none", cursor: "pointer", ...ui, padding: 0 }}
          >
            Refresh all
          </button>
        </div>
      </div>

      {/* Chip legend */}
      <div style={{ marginTop: 16, padding: "12px 16px",
        background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10,
        display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase",
          letterSpacing: "0.1em", ...ui }}>Chip actions</span>
        {CHIPS.map((c) => (
          <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%",
              background: chipColors[c.id].text, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: T.dim, ...ui }}>
              <strong style={{ color: T.text }}>{c.label}</strong>
              {" - "}opens {c.action === "analysis" ? "Analysis" : "Compare"} for this fund
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PageHeader() {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h1 style={{ fontSize: 21, fontWeight: 600, color: "var(--c-text)", margin: 0,
          ...ui, letterSpacing: "-0.01em", lineHeight: 1.2 }}>Watchlist</h1>
        <span style={{ fontSize: 9.5, fontWeight: 600, color: T.data, background: "var(--c-dataL)",
          border: `1px solid ${T.data}44`, borderRadius: 5, padding: "2px 8px", ...ui,
          letterSpacing: "0.07em", textTransform: "uppercase" }}>Live</span>
      </div>
      <p style={{ fontSize: 13, color: "var(--c-dim)", marginTop: 4, ...ui, lineHeight: 1.5 }}>
        Track funds in real time. Tap a factor chip to instantly find replacements in Compare or Analysis.
      </p>
    </div>
  );
}

function AddInput({ value, onChange, onAdd, adding, error, onClearError }: {
  value: string; onChange: (v: string) => void;
  onAdd: () => void; adding: boolean; error: string; onClearError: () => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", gap: 8, maxWidth: 380 }}>
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value.toUpperCase()); onClearError(); }}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder="Add ticker - e.g. VTI, FXAIX"
          maxLength={10}
          style={{ flex: 1, padding: "9px 13px", borderRadius: 9, fontSize: 13,
            background: "var(--c-panel2)", border: `1px solid ${error ? T.red : "var(--c-line2)"}`,
            color: "var(--c-text)", outline: "none",
            fontFamily: "'Geist Mono', monospace", transition: "border-color 0.15s" }}
          onFocus={(e) => { if (!error) e.currentTarget.style.borderColor = T.blue; }}
          onBlur={(e) => { if (!error) e.currentTarget.style.borderColor = "var(--c-line2)"; }}
        />
        <button
          onClick={onAdd}
          disabled={adding || !value.trim()}
          style={{ padding: "9px 18px", borderRadius: 9, cursor: adding || !value.trim() ? "default" : "pointer",
            background: adding || !value.trim() ? "var(--c-panel3)" : T.blue,
            color: adding || !value.trim() ? "var(--c-muted)" : "#fff",
            border: "none", fontSize: 13, fontWeight: 600, ...ui,
            opacity: adding ? 0.7 : 1, transition: "all 0.15s" }}
        >
          {adding ? "Adding…" : "+ Add"}
        </button>
      </div>
      {error && (
        <div style={{ fontSize: 11.5, color: T.red, marginTop: 5, ...ui }}>{error}</div>
      )}
    </div>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid var(--c-line2)`,
        background: "transparent", cursor: "pointer", display: "flex", alignItems: "center",
        justifyContent: "center", color: "var(--c-muted)", transition: "all 0.12s", flexShrink: 0 }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; e.currentTarget.style.background = "#FEF2F2"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--c-line2)"; e.currentTarget.style.color = "var(--c-muted)"; e.currentTarget.style.background = "transparent"; }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    </button>
  );
}
