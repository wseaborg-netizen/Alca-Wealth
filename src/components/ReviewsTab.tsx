"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { T, ui, mono } from "./tokens";
import ReviewDetail from "./ReviewDetail";

/**
 * Fund Reviews workflow (Phase 2E) — firm-scoped. List (open/completed/cancelled)
 * with search + status filter, a focused create-review form (reason required),
 * and the detail workspace. All data is firm-scoped via the API (firm resolved
 * server-side); no synthetic cases. Start Review from the fund workspace passes a
 * firm_fund context here — no review row is created until the form is submitted.
 */

const WORKFLOW = ["open", "in_review", "completed", "cancelled"] as const;
type Workflow = (typeof WORKFLOW)[number];
const WORKFLOW_LABEL: Record<Workflow, string> = { open: "Open", in_review: "In review", completed: "Completed", cancelled: "Cancelled" };
const WORKFLOW_COLOR: Record<Workflow, string> = { open: "#0E7490", in_review: "#B45309", completed: "#047857", cancelled: "#5B6472" };

interface ReviewRow {
  id: string; firmFundId: string; ticker: string; name: string | null; status: Workflow;
  reason: string | null; assignedReviewer: string | null; openedDate: string;
  reviewDate: string | null; completedDate: string | null; decision: string | null; nextReviewDate: string | null;
}
interface Reviewer { userId: string; role: string; isSelf: boolean }
interface EligibleFund { id: string; ticker: string; name: string | null }

const field: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${T.line2}`,
  background: T.panel, color: T.text, fontSize: 13, ...ui, boxSizing: "border-box" };
const label = (t: string) => <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.dim, ...ui, marginBottom: 5 }}>{t}</span>;
const reviewerLabel = (r: Reviewer) => (r.isSelf ? "You" : `Member ·${r.userId.slice(0, 6)}`);

function WFBadge({ status }: { status: Workflow }) {
  const c = WORKFLOW_COLOR[status];
  return <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 999, fontSize: 11,
    fontWeight: 600, ...ui, color: c, background: `${c}18`, border: `1px solid ${c}44` }}>{WORKFLOW_LABEL[status]}</span>;
}

export default function ReviewsTab({ context, onAnalyze, onCompareCandidates }: {
  context?: { firmFundId: string; ticker: string } | null;
  onAnalyze?: (ticker: string) => void;
  onCompareCandidates?: (tickers: string[]) => void;
} = {}) {
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "signedout" | "error">("loading");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Workflow>("all");

  // create-form data
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [funds, setFunds] = useState<EligibleFund[]>([]);
  const [form, setForm] = useState<{ firmFundId: string; reason: string; assignedReviewer: string; openedDate: string; reviewDate: string }>(
    { firmFundId: "", reason: "", assignedReviewer: "", openedDate: "", reviewDate: "" });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/reviews", { cache: "no-store" });
      if (r.status === 401) { setState("signedout"); setRows([]); return; }
      if (!r.ok) throw new Error("load error");
      const d = await r.json();
      setRows((d.reviews ?? []) as ReviewRow[]);
      setState("ready");
    } catch { setState("error"); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setState("loading"); void load(); }, [load]);

  // Load create-form reference data (eligible funds + firm reviewers) once.
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/firm-funds", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { inventory: [] })).catch(() => ({ inventory: [] })),
      fetch("/api/reviews/reviewers", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { reviewers: [] })).catch(() => ({ reviewers: [] })),
    ]).then(([inv, rev]) => {
      if (!alive) return;
      setFunds(((inv.inventory ?? []) as { id: string; ticker: string; name: string | null }[]).map((f) => ({ id: f.id, ticker: f.ticker, name: f.name })));
      setReviewers((rev.reviewers ?? []) as Reviewer[]);
    });
    return () => { alive = false; };
  }, []);

  // Start Review context → open the create form with that fund preselected.
  useEffect(() => {
    if (!context) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setForm((f) => ({ ...f, firmFundId: context.firmFundId }));
    setFormError(null);
    setView("create");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [context]);

  const submitCreate = async () => {
    if (!form.reason.trim()) { setFormError("A reason is required to start a review."); return; }
    if (!form.firmFundId) { setFormError("Select a fund from your Firm Funds."); return; }
    if (busy) return;
    setBusy(true); setFormError(null);
    try {
      const r = await fetch("/api/reviews", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ firmFundId: form.firmFundId, reason: form.reason.trim(),
          assignedReviewer: form.assignedReviewer || null, openedDate: form.openedDate || undefined, reviewDate: form.reviewDate || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setFormError(d.error || "Could not create the review."); return; }
      setForm({ firmFundId: "", reason: "", assignedReviewer: "", openedDate: "", reviewDate: "" });
      setDetailId(d.review.id); setView("detail"); await load();
    } finally { setBusy(false); }
  };

  const view_ = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toUpperCase();
    return rows.filter((r) =>
      (statusFilter === "all" || r.status === statusFilter) &&
      (!q || r.ticker.includes(q) || (r.name ?? "").toUpperCase().includes(q)));
  }, [rows, search, statusFilter]);

  const header = (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ fontSize: 25, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.02em" }}>Reviews</h1>
        <p style={{ fontSize: 13.5, color: T.dim, ...ui, margin: "8px 0 0", maxWidth: 640, lineHeight: 1.55 }}>
          Structured fund reviews — the recurring diligence your team runs on the funds it uses.
        </p>
      </div>
      {view === "list" && state === "ready" && (
        <button onClick={() => { setFormError(null); setView("create"); }}
          style={{ padding: "10px 16px", borderRadius: 9, border: "none", background: T.blue, color: "#fff", fontSize: 13, fontWeight: 600, ...ui, cursor: "pointer" }}>
          + New review
        </button>
      )}
    </header>
  );

  if (state === "signedout") {
    return <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>{header}
      <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, padding: "40px 28px", textAlign: "center", color: T.dim, ...ui, fontSize: 13.5 }}>Sign in to use Reviews.</div></div>;
  }

  // ── Detail ──
  if (view === "detail" && detailId) {
    return (
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <ReviewDetail id={detailId} onBack={() => { setView("list"); setDetailId(null); void load(); }}
          onAnalyze={onAnalyze} onCompareCandidates={onCompareCandidates} />
      </div>
    );
  }

  // ── Create ──
  if (view === "create") {
    const selfDefault = reviewers.find((r) => r.isSelf);
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        {header}
        <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, padding: 22, ...ui }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.text }}>Start a review</h2>
          <p style={{ margin: "0 0 16px", fontSize: 12.5, color: T.dim, lineHeight: 1.5 }}>Reviews are firm-scoped. A reason is required.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <label>{label("Fund")}
              <select value={form.firmFundId} onChange={(e) => setForm({ ...form, firmFundId: e.target.value })} style={field} aria-label="Fund">
                <option value="">Select a fund…</option>
                {funds.map((f) => <option key={f.id} value={f.id}>{f.ticker}{f.name ? ` — ${f.name}` : ""}</option>)}
              </select>
            </label>
            <label>{label("Reason (required)")}
              <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2}
                placeholder="Why is this review being opened?" style={{ ...field, resize: "vertical" }} aria-label="Reason" />
            </label>
            <label>{label("Assigned reviewer (optional)")}
              <select value={form.assignedReviewer} onChange={(e) => setForm({ ...form, assignedReviewer: e.target.value })} style={field} aria-label="Assigned reviewer">
                <option value="">Unassigned</option>
                {reviewers.map((r) => <option key={r.userId} value={r.userId}>{reviewerLabel(r)}{r.isSelf ? "" : ` (${r.role})`}</option>)}
                {!reviewers.length && selfDefault && <option value={selfDefault.userId}>You</option>}
              </select>
            </label>
            <div style={{ display: "flex", gap: 12 }}>
              <label style={{ flex: 1 }}>{label("Opened date (optional)")}
                <input type="date" value={form.openedDate} onChange={(e) => setForm({ ...form, openedDate: e.target.value })} style={field} aria-label="Opened date" />
              </label>
              <label style={{ flex: 1 }}>{label("Target review date (optional)")}
                <input type="date" value={form.reviewDate} onChange={(e) => setForm({ ...form, reviewDate: e.target.value })} style={field} aria-label="Target review date" />
              </label>
            </div>
          </div>
          {formError && <div role="alert" style={{ marginTop: 12, fontSize: 12.5, color: "#B42318", ...ui }}>{formError}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
            <button onClick={() => { setView("list"); setFormError(null); }} disabled={busy}
              style={{ padding: "9px 15px", borderRadius: 8, border: `1px solid ${T.line2}`, background: "transparent", color: T.dim, fontSize: 13, fontWeight: 600, ...ui, cursor: "pointer" }}>Cancel</button>
            <button onClick={submitCreate} disabled={busy || !form.reason.trim() || !form.firmFundId}
              style={{ padding: "9px 15px", borderRadius: 8, border: "none", background: T.blue, color: "#fff", fontSize: 13, fontWeight: 600, ...ui, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
              {busy ? "Creating…" : "Create review"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── List ──
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {header}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ticker or name…" aria-label="Search reviews"
          style={{ flex: "1 1 220px", minWidth: 180, padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.line2}`, background: T.panel, color: T.text, fontSize: 13, ...ui }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | Workflow)} aria-label="Filter by workflow status"
          style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.line2}`, background: T.panel, color: T.text, fontSize: 13, ...ui }}>
          <option value="all">All statuses</option>
          {WORKFLOW.map((s) => <option key={s} value={s}>{WORKFLOW_LABEL[s]}</option>)}
        </select>
      </div>

      {state === "loading" || rows === null ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: T.muted, ...ui, fontSize: 13.5 }}>Loading reviews…</div>
      ) : state === "error" ? (
        <div role="alert" style={{ background: "rgba(180,35,24,0.06)", border: "1px solid rgba(180,35,24,0.25)", borderRadius: 12, padding: "14px 16px", color: "#B42318", ...ui, fontSize: 13 }}>Could not load reviews. <button onClick={() => void load()} style={{ marginLeft: 8, textDecoration: "underline", background: "none", border: "none", color: "#B42318", cursor: "pointer" }}>Retry</button></div>
      ) : rows.length === 0 ? (
        <div style={{ background: T.panel, border: `1px dashed ${T.line2}`, borderRadius: 14, padding: "40px 28px", textAlign: "center", ...ui }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>No reviews yet</div>
          <p style={{ fontSize: 13, color: T.dim, margin: "7px auto 16px", maxWidth: 440, lineHeight: 1.6 }}>Start a review from a fund in Firm Funds, or create one here. Nothing is shown until a real review exists.</p>
          <button onClick={() => setView("create")} style={{ padding: "10px 18px", borderRadius: 9, border: "none", background: T.blue, color: "#fff", fontSize: 13, fontWeight: 600, ...ui, cursor: "pointer" }}>+ New review</button>
        </div>
      ) : view_.length === 0 ? (
        <div style={{ padding: "36px 0", textAlign: "center", color: T.muted, ...ui, fontSize: 13.5 }}>No reviews match your search or filter.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {view_.map((r) => (
            <button key={r.id} onClick={() => { setDetailId(r.id); setView("detail"); }}
              style={{ textAlign: "left", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", ...ui }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.text, ...mono }}>{r.ticker || "—"}</span>
                  <span style={{ fontSize: 12.5, color: T.dim }}>{r.name ?? ""}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {r.status === "completed" && r.decision && <span style={{ fontSize: 11.5, color: T.dim, ...ui }}>Decision: <strong style={{ color: T.text }}>{r.decision}</strong></span>}
                  <WFBadge status={r.status} />
                </span>
              </div>
              {r.reason && <div style={{ fontSize: 12.5, color: T.dim, marginTop: 6, ...ui }}>{r.reason}</div>}
              <div style={{ fontSize: 11, color: T.muted, ...mono, marginTop: 7 }}>
                Opened {r.openedDate}{r.reviewDate ? ` · Target ${r.reviewDate}` : ""}{r.completedDate ? ` · Completed ${r.completedDate}` : ""}
                {r.nextReviewDate ? ` · Next ${r.nextReviewDate}` : ""}{r.assignedReviewer ? " · Reviewer assigned" : " · Unassigned"}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
