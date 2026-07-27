"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { T, ui } from "./tokens";
import { useMediaQuery } from "./motion";

/**
 * Firm Funds — the firm's fund inventory (Phase 2C).
 *
 * Firm-scoped list of the funds a firm uses or monitors. Firm-owned fields
 * (status/role/rationale/next review) come from firm_funds; canonical identity
 * from the universe; performance from the cached Tiingo services (loaded
 * independently so a provider gap shows Unavailable, never a fake 0%). Clicking
 * a ticker/name opens the existing contextual Analysis workspace. Models/alerts
 * have no reliable relationship yet → an explicit "Not connected" state.
 */

export const STATUSES = ["approved", "watch", "candidate", "restricted", "retired"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_META: Record<Status, { label: string; fg: string; bg: string; bd: string }> = {
  approved:   { label: "Approved",   fg: "#047857", bg: "rgba(4,120,87,0.10)",  bd: "rgba(4,120,87,0.30)" },
  watch:      { label: "Watch",      fg: "#B45309", bg: "rgba(180,83,9,0.10)",  bd: "rgba(180,83,9,0.30)" },
  candidate:  { label: "Candidate",  fg: "#0E7490", bg: "rgba(14,116,144,0.10)", bd: "rgba(14,116,144,0.30)" },
  restricted: { label: "Restricted", fg: "#B42318", bg: "rgba(180,35,24,0.10)", bd: "rgba(180,35,24,0.30)" },
  retired:    { label: "Retired",    fg: "#5B6472", bg: "rgba(91,100,114,0.10)", bd: "rgba(91,100,114,0.28)" },
};

interface Row {
  id: string; ticker: string; name: string | null; vehicle: string | null;
  category: string | null; benchmark: string | null; status: Status;
  fundRole: string | null; approvalRationale: string | null;
  nextReviewDate: string | null; lastCompletedReview: string | null;
  models: { connected: boolean }; alerts: { connected: boolean };
}
interface PerfPoint { recentReturn: number | null; spark: number[] | null }
const PERF_PERIODS = ["1D", "1M", "3M", "YTD", "1Y", "3Y"] as const;
type PerfPeriod = (typeof PERF_PERIODS)[number];
const DEFAULT_PERF_PERIOD: PerfPeriod = "1M";
type PerfByPeriod = Record<PerfPeriod, PerfPoint>;

type SortKey = "ticker" | "recent" | "last" | "next";

const fmtDate = (d: string | null) => (d ? d : null);
const fmtPct = (x: number | null | undefined) =>
  typeof x === "number" && Number.isFinite(x) ? `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%` : null;

// ── Small inline sparkline (no dependency, no provider shape) ─────────────────
function Sparkline({ data }: { data: number[] | null }) {
  if (!data || data.length < 8) return <span style={{ color: T.muted, ...ui, fontSize: 11.5 }}>Unavailable</span>;
  const w = 78, h = 24, min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * h}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={up ? "#047857" : "#B42318"} strokeWidth={1.4}
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 999, fontSize: 11.5,
      fontWeight: 600, ...ui, color: m.fg, background: m.bg, border: `1px solid ${m.bd}` }}>{m.label}</span>
  );
}

const NotConnected = ({ title }: { title: string }) => (
  <span title={title} style={{ color: T.muted, ...ui, fontSize: 11.5 }}>Not connected</span>
);

// ── Add / Edit form (shared) ─────────────────────────────────────────────────
export interface FormState { ticker: string; status: Status; fundRole: string; approvalRationale: string; nextReviewDate: string }
const emptyForm: FormState = { ticker: "", status: "candidate", fundRole: "", approvalRationale: "", nextReviewDate: "" };

export function FundDialog({ mode, initial, busy, error, onClose, onSubmit }: {
  mode: "add" | "edit"; initial: FormState; busy: boolean; error: string | null;
  onClose: () => void; onSubmit: (f: FormState) => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const label = (t: string) => (
    <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.dim, ...ui, marginBottom: 5 }}>{t}</span>
  );
  const field: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${T.line2}`,
    background: T.panel, color: T.text, fontSize: 13, ...ui, boxSizing: "border-box" };
  return (
    <div role="dialog" aria-modal="true" aria-label={mode === "add" ? "Add fund" : "Edit fund"}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(16,24,40,0.36)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, background: T.panel, border: `1px solid ${T.line}`,
          borderRadius: 16, padding: 22, boxShadow: "0 24px 60px rgba(16,24,40,0.22)", ...ui }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.text }}>
          {mode === "add" ? "Add fund to inventory" : `Edit ${initial.ticker}`}
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: T.dim, lineHeight: 1.5 }}>
          {mode === "add"
            ? "Enter a ticker that exists in ALCA's fund universe. Canonical name and classification are resolved automatically."
            : "Edit firm-owned fields only. Canonical identity (name, category, benchmark, vehicle, ticker) is never editable."}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {mode === "add" && (
            <label>{label("Ticker")}
              <input autoFocus value={f.ticker} onChange={(e) => setF({ ...f, ticker: e.target.value.toUpperCase() })}
                placeholder="e.g. VTI" style={field} aria-label="Ticker" />
            </label>
          )}
          <label>{label("Status")}
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Status })} style={field} aria-label="Status">
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
          </label>
          <label>{label("Firm role (optional)")}
            <input value={f.fundRole} onChange={(e) => setF({ ...f, fundRole: e.target.value })}
              placeholder="e.g. Core US equity" style={field} aria-label="Firm role" />
          </label>
          <label>{label("Approval rationale (optional)")}
            <textarea value={f.approvalRationale} onChange={(e) => setF({ ...f, approvalRationale: e.target.value })}
              rows={2} style={{ ...field, resize: "vertical" }} aria-label="Approval rationale" />
          </label>
          <label>{label("Next review date (optional)")}
            <input type="date" value={f.nextReviewDate} onChange={(e) => setF({ ...f, nextReviewDate: e.target.value })}
              style={field} aria-label="Next review date" />
          </label>
        </div>
        {error && <div role="alert" style={{ marginTop: 12, fontSize: 12.5, color: "#B42318", ...ui }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} disabled={busy}
            style={{ padding: "9px 15px", borderRadius: 8, border: `1px solid ${T.line2}`, background: "transparent",
              color: T.dim, fontSize: 13, fontWeight: 600, ...ui, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onSubmit(f)} disabled={busy || (mode === "add" && !f.ticker.trim())}
            style={{ padding: "9px 15px", borderRadius: 8, border: "none", background: T.blue, color: "#fff",
              fontSize: 13, fontWeight: 600, ...ui, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Saving…" : mode === "add" ? "Add fund" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function FirmFundsTab({ onAnalyze, initialAddTicker, onAddTickerConsumed }: {
  onAnalyze?: (ticker: string) => void;
  initialAddTicker?: string | null;   // prefill + open the Add dialog (from "Add to Firm Funds")
  onAddTickerConsumed?: () => void;
}) {
  const isMobile = useMediaQuery("(max-width: 820px)");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [perf, setPerf] = useState<Record<string, PerfByPeriod | null>>({});
  const [perfLoaded, setPerfLoaded] = useState(false);
  const [period, setPeriod] = useState<PerfPeriod>(DEFAULT_PERF_PERIOD);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [addOpen, setAddOpen] = useState(false);
  const [addInitial, setAddInitial] = useState<FormState>(emptyForm);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // First statement is awaited, so no state updates run synchronously when this
    // is invoked from an effect (avoids a synchronous cascading re-render).
    try {
      const r = await fetch("/api/firm-funds", { cache: "no-store" });
      if (r.status === 401) { setSignedOut(true); setRows([]); setLoadError(null); return; }
      if (!r.ok) throw new Error("Could not load inventory.");
      const d = await r.json();
      setRows((d.inventory ?? []) as Row[]);
      setLoadError(null); setSignedOut(false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load inventory.");
      setRows([]);
    }
  }, []);

  // load() updates state only after an awaited fetch (never synchronously); the
  // rule can't see across the memoized callback, so the guarantee is asserted here.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // "Add to Firm Funds" from the contextual workspace prefills + opens the dialog.
  useEffect(() => {
    if (!initialAddTicker) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setAddInitial({ ...emptyForm, ticker: initialAddTicker.toUpperCase() });
    setDialogError(null);
    setAddOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    onAddTickerConsumed?.();
  }, [initialAddTicker, onAddTickerConsumed]);

  // Bounded performance enrichment — one request for the loaded inventory.
  // State is only updated inside the async callbacks (never synchronously in the
  // effect body), so this never triggers a synchronous cascading re-render.
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    let alive = true;
    const tickers = rows.map((r) => r.ticker);
    fetch("/api/firm-funds/performance", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tickers }),
    }).then((r) => (r.ok ? r.json() : { performance: {} }))
      .then((d) => { if (alive) { setPerf((d.performance ?? {}) as Record<string, PerfByPeriod | null>); setPerfLoaded(true); } })
      .catch(() => { if (alive) setPerfLoaded(true); }); // enrichment failure → Unavailable, list stands
    return () => { alive = false; };
  }, [rows]);

  const view = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toUpperCase();
    let out = rows.filter((r) =>
      (statusFilter === "all" || r.status === statusFilter) &&
      (!q || r.ticker.includes(q) || (r.name ?? "").toUpperCase().includes(q)));
    const dir = sortDir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      if (sortKey === "ticker") return a.ticker.localeCompare(b.ticker) * dir;
      if (sortKey === "recent") {
        const av = perf[a.ticker]?.[period]?.recentReturn, bv = perf[b.ticker]?.[period]?.recentReturn;
        if (av == null && bv == null) return 0; if (av == null) return 1; if (bv == null) return -1; // Unavailable sinks
        return (av - bv) * dir;
      }
      const ad = (sortKey === "last" ? a.lastCompletedReview : a.nextReviewDate) ?? "";
      const bd = (sortKey === "last" ? b.lastCompletedReview : b.nextReviewDate) ?? "";
      if (!ad && !bd) return 0; if (!ad) return 1; if (!bd) return -1;
      return ad.localeCompare(bd) * dir;
    });
    return out;
  }, [rows, search, statusFilter, sortKey, sortDir, perf, period]);

  const submitAdd = async (f: FormState) => {
    setDialogBusy(true); setDialogError(null);
    try {
      const r = await fetch("/api/firm-funds", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", ticker: f.ticker, status: f.status,
          fundRole: f.fundRole || null, approvalRationale: f.approvalRationale || null,
          nextReviewDate: f.nextReviewDate || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setDialogError(d.error || "Could not add fund."); return; }
      setAddOpen(false); await load();
    } finally { setDialogBusy(false); }
  };

  const submitEdit = async (f: FormState) => {
    if (!editRow) return;
    setDialogBusy(true); setDialogError(null);
    try {
      const r = await fetch("/api/firm-funds", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update", id: editRow.id, status: f.status,
          fundRole: f.fundRole || null, approvalRationale: f.approvalRationale || null,
          nextReviewDate: f.nextReviewDate || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setDialogError(d.error || "Could not save changes."); return; }
      setEditRow(null); await load();
    } finally { setDialogBusy(false); }
  };

  const header = (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ fontSize: 25, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.02em" }}>Firm Funds</h1>
        <p style={{ fontSize: 13.5, color: T.dim, ...ui, margin: "8px 0 0", maxWidth: 640, lineHeight: 1.55 }}>
          Your firm&apos;s curated fund inventory — the funds you use or monitor, with firm status, roles, and review cadence.
        </p>
      </div>
      <button onClick={() => { setDialogError(null); setAddOpen(true); }} disabled={signedOut}
        style={{ padding: "10px 16px", borderRadius: 9, border: "none", background: T.blue, color: "#fff",
          fontSize: 13, fontWeight: 600, ...ui, cursor: signedOut ? "default" : "pointer", opacity: signedOut ? 0.5 : 1 }}>
        + Add Fund
      </button>
    </header>
  );

  // ── States ──
  if (signedOut) {
    return (
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>
        {header}
        <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, padding: "40px 28px",
          textAlign: "center", color: T.dim, ...ui, fontSize: 13.5 }}>
          Sign in to use Firm Funds.
        </div>
      </div>
    );
  }

  const periodSelector = (
    <div role="group" aria-label="Performance period"
      style={{ display: "inline-flex", border: `1px solid ${T.line2}`, borderRadius: 9, overflow: "hidden" }}>
      {PERF_PERIODS.map((p) => (
        <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p}
          style={{ padding: "8px 11px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, ...ui,
            background: period === p ? T.blue : "transparent", color: period === p ? "#fff" : T.dim,
            borderLeft: p === "1D" ? "none" : `1px solid ${T.line2}` }}>{p}</button>
      ))}
    </div>
  );

  const controls = (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ticker or name…"
        aria-label="Search inventory"
        style={{ flex: "1 1 220px", minWidth: 180, padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.line2}`,
          background: T.panel, color: T.text, fontSize: 13, ...ui }} />
      {periodSelector}
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | Status)} aria-label="Filter by status"
        style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.line2}`, background: T.panel, color: T.text, fontSize: 13, ...ui }}>
        <option value="all">All statuses</option>
        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
      </select>
      <select value={`${sortKey}:${sortDir}`} onChange={(e) => { const [k, d] = e.target.value.split(":"); setSortKey(k as SortKey); setSortDir(d as "asc" | "desc"); }}
        aria-label="Sort inventory"
        style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.line2}`, background: T.panel, color: T.text, fontSize: 13, ...ui }}>
        <option value="ticker:asc">Ticker A–Z</option>
        <option value="ticker:desc">Ticker Z–A</option>
        <option value="recent:desc">Recent return (high first)</option>
        <option value="recent:asc">Recent return (low first)</option>
        <option value="last:desc">Last review (newest)</option>
        <option value="next:asc">Next review (soonest)</option>
      </select>
    </div>
  );

  const tickerButton = (r: Row) => (
    <button onClick={() => onAnalyze?.(r.ticker)}
      style={{ border: "none", background: "none", padding: 0, cursor: "pointer", textAlign: "left",
        color: T.blue, fontWeight: 700, fontSize: 13.5, ...ui }}
      aria-label={`Open analysis for ${r.ticker}`}>{r.ticker}</button>
  );

  // Both the sparkline and the recent return use the SAME selected period.
  const perfAt = (r: Row): PerfPoint | undefined => perf[r.ticker]?.[period];
  const perfCell = (r: Row) => {
    const p = perfAt(r);
    if (!perfLoaded && !perf[r.ticker]) return <span style={{ color: T.muted, ...ui, fontSize: 11.5 }}>Loading…</span>;
    return <Sparkline data={p?.spark ?? null} />;
  };
  const recentCell = (r: Row) => {
    const p = perfAt(r);
    if (!perfLoaded && !perf[r.ticker]) return <span style={{ color: T.muted, ...ui, fontSize: 12 }}>…</span>;
    const v = fmtPct(p?.recentReturn);
    if (v == null) return <span style={{ color: T.muted, ...ui, fontSize: 12 }}>Unavailable</span>;
    return <span style={{ color: (p!.recentReturn! >= 0 ? "#047857" : "#B42318"), fontWeight: 600, fontSize: 13, ...ui }}>{v}</span>;
  };

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {header}
      {controls}

      {loadError && (
        <div role="alert" style={{ background: "rgba(180,35,24,0.06)", border: "1px solid rgba(180,35,24,0.25)",
          borderRadius: 12, padding: "14px 16px", color: "#B42318", ...ui, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span>{loadError}</span>
          <button onClick={() => void load()} style={{ border: "1px solid rgba(180,35,24,0.4)", background: "transparent",
            color: "#B42318", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, ...ui, cursor: "pointer" }}>Retry</button>
        </div>
      )}

      {rows === null ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: T.muted, ...ui, fontSize: 13.5 }}>Loading inventory…</div>
      ) : rows.length === 0 && !loadError ? (
        <div style={{ background: T.panel, border: `1px dashed ${T.line2}`, borderRadius: 14, padding: "40px 28px",
          textAlign: "center", ...ui }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>No funds in your inventory yet</div>
          <p style={{ fontSize: 13, color: T.dim, margin: "7px auto 16px", maxWidth: 440, lineHeight: 1.6 }}>
            Add a fund from ALCA&apos;s universe to start building your firm&apos;s shelf. Nothing is shown until you add real funds.
          </p>
          <button onClick={() => { setDialogError(null); setAddOpen(true); }}
            style={{ padding: "10px 18px", borderRadius: 9, border: "none", background: T.blue, color: "#fff", fontSize: 13, fontWeight: 600, ...ui, cursor: "pointer" }}>+ Add Fund</button>
        </div>
      ) : view.length === 0 ? (
        <div style={{ padding: "36px 0", textAlign: "center", color: T.muted, ...ui, fontSize: 13.5 }}>No funds match your search or filter.</div>
      ) : isMobile ? (
        // ── Mobile: stacked cards ──
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {view.map((r) => (
            <div key={r.id} style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, ...ui }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div>
                  {tickerButton(r)}
                  <div style={{ fontSize: 12.5, color: T.dim, marginTop: 2 }}>{r.name ?? "Unavailable"}</div>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <Sparkline data={perfAt(r)?.spark ?? null} />
                <div>{recentCell(r)}</div>
              </div>
              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", margin: "12px 0 0", fontSize: 12 }}>
                <dt style={{ color: T.muted }}>Role</dt><dd style={{ margin: 0, color: T.text }}>{r.fundRole ?? "—"}</dd>
                <dt style={{ color: T.muted }}>Last review</dt><dd style={{ margin: 0, color: T.text }}>{fmtDate(r.lastCompletedReview) ?? "None yet"}</dd>
                <dt style={{ color: T.muted }}>Next review</dt><dd style={{ margin: 0, color: T.text }}>{fmtDate(r.nextReviewDate) ?? "—"}</dd>
                <dt style={{ color: T.muted }}>Models</dt><dd style={{ margin: 0 }}><NotConnected title="No model relationship is configured yet." /></dd>
                <dt style={{ color: T.muted }}>Alerts</dt><dd style={{ margin: 0 }}><NotConnected title="No alert relationship is configured yet." /></dd>
              </dl>
              <div style={{ marginTop: 12, textAlign: "right" }}>
                <button onClick={() => { setDialogError(null); setEditRow(r); }}
                  style={{ border: `1px solid ${T.line2}`, background: "transparent", color: T.dim, borderRadius: 8,
                    padding: "6px 12px", fontSize: 12.5, fontWeight: 600, ...ui, cursor: "pointer" }}>Edit</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // ── Desktop: table ──
        <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 14, background: T.panel }}>
          <table style={{ width: "100%", borderCollapse: "collapse", ...ui, fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: T.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {["Ticker", "Name", period, `${period} Return`, "Status", "Role", "Last review", "Next review", "Models", "Alerts", ""].map((h, i) => (
                  <th key={i} style={{ padding: "12px 14px", borderBottom: `1px solid ${T.line}`, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <td style={{ padding: "11px 14px" }}>{tickerButton(r)}</td>
                  <td style={{ padding: "11px 14px", maxWidth: 220 }}>
                    <button onClick={() => onAnalyze?.(r.ticker)} title={r.name ?? undefined}
                      style={{ border: "none", background: "none", padding: 0, cursor: "pointer", textAlign: "left",
                        color: r.name ? T.text : T.muted, fontSize: 13, ...ui, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 210, display: "block" }}>
                      {r.name ?? "Unavailable"}
                    </button>
                  </td>
                  <td style={{ padding: "11px 14px" }}>{perfCell(r)}</td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>{recentCell(r)}</td>
                  <td style={{ padding: "11px 14px" }}><StatusBadge status={r.status} /></td>
                  <td style={{ padding: "11px 14px", color: r.fundRole ? T.text : T.muted }}>{r.fundRole ?? "—"}</td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap", color: r.lastCompletedReview ? T.text : T.muted }}>{fmtDate(r.lastCompletedReview) ?? "None yet"}</td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap", color: r.nextReviewDate ? T.text : T.muted }}>{fmtDate(r.nextReviewDate) ?? "—"}</td>
                  <td style={{ padding: "11px 14px" }}><NotConnected title="No model relationship is configured yet." /></td>
                  <td style={{ padding: "11px 14px" }}><NotConnected title="No alert relationship is configured yet." /></td>
                  <td style={{ padding: "11px 14px", textAlign: "right" }}>
                    <button onClick={() => { setDialogError(null); setEditRow(r); }}
                      style={{ border: `1px solid ${T.line2}`, background: "transparent", color: T.dim, borderRadius: 8,
                        padding: "5px 11px", fontSize: 12, fontWeight: 600, ...ui, cursor: "pointer" }}
                      aria-label={`Edit ${r.ticker}`}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <FundDialog mode="add" initial={addInitial} busy={dialogBusy} error={dialogError}
          onClose={() => { setAddOpen(false); setAddInitial(emptyForm); }} onSubmit={submitAdd} />
      )}
      {editRow && (
        <FundDialog mode="edit" busy={dialogBusy} error={dialogError}
          initial={{ ticker: editRow.ticker, status: editRow.status, fundRole: editRow.fundRole ?? "",
            approvalRationale: editRow.approvalRationale ?? "", nextReviewDate: editRow.nextReviewDate ?? "" }}
          onClose={() => setEditRow(null)} onSubmit={submitEdit} />
      )}
    </div>
  );
}
