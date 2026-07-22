"use client";
/**
 * Expansion Operations Center — internal admin console for the ALCA fund
 * universe. Three tabs: Add Funds (single/bulk import), Review Queue (human
 * verification + approve/edit/delete + bulk), Failed Imports (retry/delete +
 * bulk). Only VERIFIED funds enter the merged universe; approving propagates
 * live (refreshMergedUniverse). No fabricated analytics.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { T, ui, mono } from "./tokens";
import { Btn, Card, Label, Spinner } from "./ui";
import { refreshMergedUniverse } from "@/lib/universeClient";
import { TAXONOMY_OPTIONS } from "@/lib/expansionOps";

type SubTab = "add" | "review" | "failed";
interface UniverseCounts { static: number; dynamic: number; merged: number }
interface ReviewItem {
  id: string; ticker: string; fund_name: string | null; issue: string; reason: string | null;
  suggestedPrimary: string | null; suggestedCategory: string | null;
  suggested: Record<string, string | null> | null;
  confidence: "High" | "Medium" | "Low" | "Invalid" | "—"; provider: string; status: string; imported_at: string;
}
interface FailedItem {
  id: string; ticker: string; fund_name: string | null; failureReason: string;
  providerResponse: string; status: string; attempted_at: string;
}
interface ImportSummary { added: number; needsReview: number; duplicates: number; failed: number; unsupported: number; total: number }

const CONF_TONE: Record<string, string> = { High: "#22c55e", Medium: "#3b82f6", Low: "#f59e0b", Invalid: "#ef4444", "—": T.muted };
const EDIT_FIELDS: { key: keyof typeof TAXONOMY_OPTIONS; label: string }[] = [
  { key: "asset_class", label: "Asset Class" }, { key: "primary_category", label: "Category" },
  { key: "region", label: "Region" }, { key: "management_style", label: "Management Style" },
  { key: "portfolio_role", label: "Portfolio Role" }, { key: "investment_focus", label: "Investment Focus" },
  { key: "benchmark_category", label: "Benchmark" }, { key: "market_cap", label: "Market Cap" }, { key: "style", label: "Style" },
];

const inp: React.CSSProperties = { padding: "8px 11px", borderRadius: 8, border: `1px solid ${T.line2}`, background: T.panel, color: T.text, fontSize: 12.5, ...ui, outline: "none" };
const th: React.CSSProperties = { textAlign: "left", fontSize: 10, color: T.muted, ...ui, padding: "6px 12px 8px 0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "9px 12px 9px 0", fontSize: 12, color: T.dim, ...ui, verticalAlign: "middle" };
const miniBtn = (color: string, border = true): React.CSSProperties => ({ padding: "5px 10px", borderRadius: 7, border: border ? `1px solid ${color}55` : "none", background: border ? T.panel : color, color: border ? color : "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", ...ui, whiteSpace: "nowrap" });

export default function ExpansionTab({ onAnalyze }: { onAnalyze?: (t: string) => void }) {
  const [signedOut, setSignedOut] = useState(false);
  const [tab, setTab] = useState<SubTab>("add");
  const [counts, setCounts] = useState<UniverseCounts | null>(null);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [failed, setFailed] = useState<FailedItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);

  const loadQueue = useCallback(async () => {
    const r = await fetch("/api/expansion/queue", { cache: "no-store" });
    if (r.status === 401) { setSignedOut(true); setLoadingQueue(false); return; }
    const d = await r.json();
    setReview((d.review ?? []) as ReviewItem[]);
    setFailed((d.failed ?? []) as FailedItem[]);
    setCounts(d.counts?.universe ?? null);
    setLoadingQueue(false);
  }, []);
  useEffect(() => { void loadQueue().catch(() => setLoadingQueue(false)); }, [loadQueue]);

  if (signedOut) return (
    <div style={{ maxWidth: 1360, margin: "0 auto" }}>
      <Card style={{ padding: "26px 28px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, ...ui }}>Sign in to use the Expansion Operations Center</div>
        <a href="/login" style={{ display: "inline-block", marginTop: 14, padding: "10px 18px", borderRadius: 9, background: T.blue, color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none", ...ui }}>Sign in</a>
      </Card>
    </div>
  );

  const TABS: { id: SubTab; label: string; n?: number }[] = [
    { id: "add", label: "Add Funds" }, { id: "review", label: "Review Queue", n: review.length }, { id: "failed", label: "Failed Imports", n: failed.length },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1360, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 25, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.02em" }}>Expansion Operations</h1>
          <p style={{ fontSize: 13, color: T.dim, ...ui, margin: "6px 0 0" }}>Import, review, verify, and manage the ALCA dynamic fund universe.</p>
        </div>
        {counts && (
          <div style={{ display: "flex", gap: 18 }}>
            {[["Verified (merged)", counts.merged, true], ["Static base", counts.static, false], ["Dynamic added", counts.dynamic, false]].map(([l, v, hi]) => (
              <div key={l as string} style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: hi ? T.data : T.text, ...mono }}>{(v as number).toLocaleString()}</div>
                <div style={{ fontSize: 10, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.05em" }}>{l as string}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* sub-tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.line}` }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "9px 16px", border: "none", background: "none", cursor: "pointer", ...ui, fontSize: 13,
              fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? T.blue : T.dim,
              borderBottom: `2px solid ${tab === t.id ? T.blue : "transparent"}`, marginBottom: -1 }}>
            {t.label}{t.n != null && t.n > 0 ? ` (${t.n})` : ""}
          </button>
        ))}
      </div>

      {tab === "add" && <AddFunds onDone={() => { void loadQueue(); void refreshMergedUniverse(); }} onAnalyze={onAnalyze} />}
      {tab === "review" && (loadingQueue ? <Spinner label="Loading review queue…" /> : <ReviewQueue items={review} reload={loadQueue} />)}
      {tab === "failed" && (loadingQueue ? <Spinner label="Loading failed imports…" /> : <FailedImports items={failed} reload={loadQueue} />)}
    </div>
  );
}

// ── Tab 1: Add Funds ──────────────────────────────────────────────────────────
function AddFunds({ onDone, onAnalyze }: { onDone: () => void; onAnalyze?: (t: string) => void }) {
  const [single, setSingle] = useState("");
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  const run = async (tickers: string[]) => {
    if (!tickers.length || busy) return;
    setBusy(true); setSummary(null); setAdded([]);
    try {
      const r = await fetch("/api/expansion/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickers }) });
      const d = await r.json();
      if (!r.ok) { setSummary(null); return; }
      setSummary(d.summary as ImportSummary);
      setAdded(((d.results ?? []) as { ticker: string; bucket: string }[]).filter((x) => x.bucket === "verified").map((x) => x.ticker));
      setSingle(""); setBulk("");
      onDone();
    } finally { setBusy(false); }
  };

  const bulkTickers = bulk.split(/[\s,]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
  const stat = (label: string, v: number, c: string) => (
    <div style={{ flex: 1, minWidth: 110, background: T.panel, border: `1px solid ${T.line2}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: c, ...mono }}>{v}</div>
      <div style={{ fontSize: 11, color: T.muted, ...ui, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card style={{ padding: "18px 22px" }}>
        <Label>Single ticker</Label>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={single} placeholder="e.g. SCHD" autoCapitalize="characters" spellCheck={false}
            onChange={(e) => setSingle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void run([single.trim()]); }}
            style={{ ...inp, width: 200, ...mono, textTransform: "uppercase" }} />
          <Btn onClick={() => void run([single.trim()])} disabled={!single.trim() || busy}>Import</Btn>
        </div>
      </Card>

      <Card style={{ padding: "18px 22px" }}>
        <Label>Bulk import</Label>
        <p style={{ fontSize: 11.5, color: T.muted, ...ui, margin: "4px 0 8px" }}>One ticker per line (or comma-separated). Up to 200 per import.</p>
        <textarea value={bulk} placeholder={"VTI\nSCHD\nAVUV\n…"} rows={6} spellCheck={false}
          onChange={(e) => setBulk(e.target.value)}
          style={{ ...inp, width: "100%", boxSizing: "border-box", resize: "vertical", ...mono, textTransform: "uppercase", lineHeight: 1.5 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
          <Btn onClick={() => void run(bulkTickers)} disabled={bulkTickers.length === 0 || busy}>
            {busy ? "Importing…" : `Import ${bulkTickers.length || ""} fund${bulkTickers.length === 1 ? "" : "s"}`}
          </Btn>
          {busy && <Spinner label="Looking up, classifying, verifying…" />}
        </div>
      </Card>

      {summary && (
        <Card style={{ padding: "18px 22px" }}>
          <Label>Import summary</Label>
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            {stat("Added", summary.added, T.green)}
            {stat("Needs Review", summary.needsReview, T.amber)}
            {stat("Duplicates", summary.duplicates, T.blue)}
            {stat("Failed", summary.failed, T.red)}
            {stat("Unsupported", summary.unsupported, T.muted)}
          </div>
          {added.length > 0 && (
            <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11.5, color: T.dim, ...ui }}>Verified & added:</span>
              {added.map((t) => (
                <button key={t} onClick={() => onAnalyze?.(t)} style={{ ...miniBtn(T.blue), ...mono }}>{t} ↗</button>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11, color: T.muted, ...ui, margin: "12px 0 0" }}>
            Verified funds are live in the merged universe now — searchable in Research, Analysis, Portfolio, and Model. Items needing attention are in the Review Queue; provider failures are in Failed Imports.
          </p>
        </Card>
      )}
    </div>
  );
}

// ── Shared bulk-select hook ───────────────────────────────────────────────────
function useSelection() {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = (ids: string[], on: boolean) => setSel(on ? new Set(ids) : new Set());
  const clear = () => setSel(new Set());
  return { sel, toggle, toggleAll, clear };
}

// ── Tab 2: Review Queue ───────────────────────────────────────────────────────
const REVIEW_FILTERS: { id: string; label: string; match: (i: ReviewItem) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "missing", label: "Missing Category", match: (i) => i.issue === "Missing Category" },
  { id: "low", label: "Low Confidence", match: (i) => i.confidence === "Low" || i.issue.includes("Low Confidence") },
  { id: "conflict", label: "Invalid / Conflicting", match: (i) => i.issue === "Invalid Taxonomy Value" || i.confidence === "Invalid" },
  { id: "incomplete", label: "Incomplete", match: (i) => i.issue === "Incomplete Metadata" || i.issue === "Needs Verification" },
  { id: "recent", label: "Recently Imported", match: (i) => Date.now() - new Date(i.imported_at).getTime() < 24 * 3600 * 1000 },
];
const PAGE = 50;

function ReviewQueue({ items, reload }: { items: ReviewItem[]; reload: () => Promise<void> }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{ id: string; fields: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const { sel, toggle, toggleAll, clear } = useSelection();

  const filtered = useMemo(() => {
    const f = REVIEW_FILTERS.find((x) => x.id === filter)!;
    const s = q.trim().toUpperCase();
    return items.filter((i) => f.match(i) && (!s || i.ticker.includes(s) || (i.fund_name ?? "").toUpperCase().includes(s)));
  }, [items, filter, q]);
  const pageItems = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pageIds = pageItems.map((i) => i.id);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { await fetch("/api/expansion/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
    finally { clear(); setEditing(null); await reload(); await refreshMergedUniverse(); setBusy(false); }
  };
  const startEdit = (i: ReviewItem) => {
    const base: Record<string, string> = {};
    for (const { key } of EDIT_FIELDS) base[key] = (i.suggested?.[key] as string) ?? (TAXONOMY_OPTIONS[key][0] ?? "");
    setEditing({ id: i.id, fields: base });
  };

  if (items.length === 0) return <Empty text="No funds need review. Import funds under Add Funds — anything the classifier can't confidently place lands here." />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* filter + search + bulk */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {REVIEW_FILTERS.map((f) => (
            <button key={f.id} onClick={() => { setFilter(f.id); setPage(0); }}
              style={{ padding: "6px 11px", borderRadius: 999, border: `1px solid ${filter === f.id ? T.blue : T.line2}`, background: filter === f.id ? `${T.blue}14` : T.panel, color: filter === f.id ? T.blue : T.dim, fontSize: 11.5, fontWeight: 600, cursor: "pointer", ...ui }}>{f.label}</button>
          ))}
        </div>
        <input value={q} placeholder="Search ticker or name…" onChange={(e) => { setQ(e.target.value); setPage(0); }} style={{ ...inp, marginLeft: "auto", width: 220 }} />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, color: T.muted, ...ui }}>{sel.size} selected · {filtered.length} in view</span>
        <button disabled={sel.size === 0 || busy} onClick={() => void act({ action: "approve", ids: [...sel] })} style={{ ...miniBtn(T.green, false), opacity: sel.size ? 1 : 0.5 }}>Approve Selected</button>
        <button disabled={sel.size === 0 || busy} onClick={() => void act({ action: "delete", ids: [...sel] })} style={{ ...miniBtn(T.red), opacity: sel.size ? 1 : 0.5 }}>Delete Selected</button>
        <button disabled={busy} onClick={() => { if (window.confirm(`Delete all ${items.length} pending review items? This cannot be undone.`)) void act({ action: "deleteAllReview" }); }} style={{ ...miniBtn(T.red), marginLeft: "auto" }}>Delete All Review</button>
      </div>

      <Card style={{ padding: "6px 22px 14px", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
          <thead><tr>
            <th style={{ ...th, width: 26 }}><input type="checkbox" checked={pageIds.length > 0 && pageIds.every((id) => sel.has(id))} onChange={(e) => toggleAll(pageIds, e.target.checked)} /></th>
            {["Ticker", "Fund Name", "Issue", "Suggested", "Conf.", "Provider", "Imported", "Actions"].map((h) => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {pageItems.map((i) => (
              <React.Fragment key={i.id}>
                <tr style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={td}><input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} /></td>
                  <td style={td}><span style={{ fontSize: 12.5, fontWeight: 700, color: T.blue, ...mono }}>{i.ticker}</span></td>
                  <td style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.fund_name ?? "—"}</td>
                  <td style={td}><span style={{ fontSize: 11, color: T.amber, background: `${T.amber}14`, border: `1px solid ${T.amber}44`, borderRadius: 6, padding: "2px 7px", ...ui, whiteSpace: "nowrap" }}>{i.issue}</span></td>
                  <td style={{ ...td, ...mono, fontSize: 11 }}>{i.suggestedPrimary ?? "—"}</td>
                  <td style={td}><span style={{ color: CONF_TONE[i.confidence], fontWeight: 700, fontSize: 11.5 }}>{i.confidence}</span></td>
                  <td style={{ ...td, fontSize: 11 }}>{i.provider}</td>
                  <td style={{ ...td, ...mono, fontSize: 10.5, color: T.muted }}>{new Date(i.imported_at).toLocaleDateString()}</td>
                  <td style={td}>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button disabled={busy} onClick={() => void act({ action: "approve", ids: [i.id] })} style={miniBtn(T.green, false)} title="Approve suggested values">Approve</button>
                      <button disabled={busy} onClick={() => (editing?.id === i.id ? setEditing(null) : startEdit(i))} style={miniBtn(T.blue)}>Edit</button>
                      <button disabled={busy} onClick={() => void act({ action: "delete", ids: [i.id] })} style={miniBtn(T.red)}>Delete</button>
                    </span>
                  </td>
                </tr>
                {editing?.id === i.id && (
                  <tr style={{ background: T.panel3 }}>
                    <td colSpan={9} style={{ padding: "12px 12px 14px" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.text, ...ui, marginBottom: 8 }}>Edit classification — {i.ticker}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
                        {EDIT_FIELDS.map(({ key, label }) => (
                          <label key={key} style={{ fontSize: 10.5, color: T.muted, ...ui }}>{label}
                            <select value={editing.fields[key]} onChange={(e) => setEditing({ id: i.id, fields: { ...editing.fields, [key]: e.target.value } })} style={{ ...inp, width: "100%", marginTop: 3 }}>
                              {TAXONOMY_OPTIONS[key].map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button disabled={busy} onClick={() => void act({ action: "editApprove", id: i.id, fields: editing.fields })} style={miniBtn(T.green, false)}>Save &amp; Approve</button>
                        <button disabled={busy} onClick={() => setEditing(null)} style={miniBtn(T.muted)}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p style={{ fontSize: 12, color: T.muted, ...ui, padding: "12px 0 0" }}>No items match this filter/search.</p>}
        <Pager page={page} total={filtered.length} onPage={setPage} />
      </Card>
    </div>
  );
}

// ── Tab 3: Failed Imports ─────────────────────────────────────────────────────
function FailedImports({ items, reload }: { items: FailedItem[]; reload: () => Promise<void> }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const { sel, toggle, toggleAll, clear } = useSelection();

  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase();
    return items.filter((i) => !s || i.ticker.includes(s) || (i.fund_name ?? "").toUpperCase().includes(s));
  }, [items, q]);
  const pageItems = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pageIds = pageItems.map((i) => i.id);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { await fetch("/api/expansion/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
    finally { clear(); await reload(); await refreshMergedUniverse(); setBusy(false); }
  };

  if (items.length === 0) return <Empty text="No failed imports. Provider errors, timeouts, and unsupported tickers appear here for retry or removal." />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, color: T.muted, ...ui }}>{sel.size} selected · {filtered.length} failed</span>
        <button disabled={sel.size === 0 || busy} onClick={() => void act({ action: "retry", ids: [...sel] })} style={{ ...miniBtn(T.blue, false), opacity: sel.size ? 1 : 0.5 }}>Retry Selected</button>
        <button disabled={sel.size === 0 || busy} onClick={() => void act({ action: "delete", ids: [...sel] })} style={{ ...miniBtn(T.red), opacity: sel.size ? 1 : 0.5 }}>Delete Selected</button>
        <input value={q} placeholder="Search…" onChange={(e) => { setQ(e.target.value); setPage(0); }} style={{ ...inp, width: 200 }} />
        <button disabled={busy} onClick={() => { if (window.confirm(`Delete all ${items.length} failed imports? This cannot be undone.`)) void act({ action: "deleteAllFailed" }); }} style={{ ...miniBtn(T.red), marginLeft: "auto" }}>Delete All Failed</button>
      </div>

      <Card style={{ padding: "6px 22px 14px", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
          <thead><tr>
            <th style={{ ...th, width: 26 }}><input type="checkbox" checked={pageIds.length > 0 && pageIds.every((id) => sel.has(id))} onChange={(e) => toggleAll(pageIds, e.target.checked)} /></th>
            {["Ticker", "Failure Reason", "Provider Response", "Attempted", "Actions"].map((h) => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {pageItems.map((i) => (
              <tr key={i.id} style={{ borderTop: `1px solid ${T.line}` }}>
                <td style={td}><input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} /></td>
                <td style={td}><span style={{ fontSize: 12.5, fontWeight: 700, color: T.blue, ...mono }}>{i.ticker}</span></td>
                <td style={td}><span style={{ fontSize: 11, color: T.red, background: `${T.red}12`, border: `1px solid ${T.red}40`, borderRadius: 6, padding: "2px 7px", ...ui, whiteSpace: "nowrap" }}>{i.failureReason}</span></td>
                <td style={{ ...td, maxWidth: 320, fontSize: 11, color: T.muted }}>{i.providerResponse}</td>
                <td style={{ ...td, ...mono, fontSize: 10.5, color: T.muted }}>{new Date(i.attempted_at).toLocaleDateString()}</td>
                <td style={td}>
                  <span style={{ display: "flex", gap: 6 }}>
                    <button disabled={busy} onClick={() => void act({ action: "retry", ids: [i.id] })} style={miniBtn(T.blue, false)}>Retry</button>
                    <button disabled={busy} onClick={() => void act({ action: "delete", ids: [i.id] })} style={miniBtn(T.red)}>Delete</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager page={page} total={filtered.length} onPage={setPage} />
      </Card>
    </div>
  );
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE);
  if (pages <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, justifyContent: "flex-end" }}>
      <button disabled={page === 0} onClick={() => onPage(page - 1)} style={{ ...miniBtn(T.dim), opacity: page === 0 ? 0.4 : 1 }}>← Prev</button>
      <span style={{ fontSize: 11.5, color: T.muted, ...ui }}>Page {page + 1} of {pages}</span>
      <button disabled={page >= pages - 1} onClick={() => onPage(page + 1)} style={{ ...miniBtn(T.dim), opacity: page >= pages - 1 ? 0.4 : 1 }}>Next →</button>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <Card style={{ padding: "28px 26px" }}><p style={{ fontSize: 13, color: T.muted, ...ui, margin: 0, lineHeight: 1.6 }}>{text}</p></Card>;
}
