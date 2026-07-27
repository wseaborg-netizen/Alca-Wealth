"use client";
import React, { useCallback, useEffect, useState } from "react";
import { T, ui, mono } from "./tokens";
import { FundDialog, StatusBadge, type FormState, type Status } from "./FirmFundsTab";

/**
 * Firm context + review history for the selected fund inside the contextual
 * Analysis workspace (Phase 2D). Reads firm-scoped data from /api/firm-funds/
 * context; when the fund is in the firm's inventory it shows firm status/role/
 * rationale/reviews and allows editing firm-owned fields only. When it is not,
 * it offers "Add to Firm Funds". Models/alerts have no reliable relationship yet
 * → "Not connected". Fund-specific evidence reuses the existing SEC filings
 * endpoint (fund-specific only, not a general market feed). Canonical identity
 * comes from the workspace (universe-resolved), never from this panel.
 */

interface FirmFund {
  id: string; normalized_ticker: string; status: Status;
  fund_role: string | null; approval_rationale: string | null; next_review_date: string | null;
}
interface Review {
  id: string; status: "open" | "in_review" | "completed" | "cancelled";
  reason: string | null; assigned_reviewer: string | null;
  opened_date: string; review_date: string | null; completed_date: string | null;
  decision: string | null; rationale: string | null;
}

const REVIEW_STATUS_LABEL: Record<Review["status"], string> = {
  open: "Open", in_review: "In review", completed: "Completed", cancelled: "Cancelled",
};

const Section = ({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "16px 18px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</span>
      {action}
    </div>
    {children}
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div style={{ fontSize: 10.5, color: T.muted, ...ui, marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 13, color: T.text, ...ui }}>{children}</div>
  </div>
);

const NotConnected = ({ title }: { title: string }) => (
  <span title={title} style={{ color: T.muted, ...ui, fontSize: 12 }}>Not connected</span>
);

export default function FirmContextPanel({
  ticker, cameFromFirmFunds, onBack, onStartReview, onAddToFirmFunds,
}: {
  ticker: string;
  cameFromFirmFunds?: boolean;
  onBack?: () => void;
  onStartReview?: (firmFundId: string, ticker: string) => void;
  onAddToFirmFunds?: (ticker: string) => void;
}) {
  const [firmFund, setFirmFund] = useState<FirmFund | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "signedout" | "error">("loading");
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Fund-specific evidence — existing SEC filings source (defensive/optional).
  const [filings, setFilings] = useState<{ form: string; date: string | null; url: string | null }[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/firm-funds/context?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" });
      if (r.status === 401) { setState("signedout"); setFirmFund(null); setReviews([]); return; }
      if (!r.ok) throw new Error("context error");
      const d = await r.json();
      setFirmFund(d.firmFund ?? null);
      setReviews((d.reviews ?? []) as Review[]);
      setState("ready");
    } catch { setState("error"); }
  }, [ticker]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setState("loading"); void load(); }, [load]);

  // Independent evidence fetch — never blocks the firm context; failure → unavailable.
  useEffect(() => {
    let alive = true;
    fetch(`/api/sec/fund/${encodeURIComponent(ticker)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        const items = (d?.filings ?? []) as { form_type?: string; filing_date?: string; filing_url?: string }[];
        setFilings(items.slice(0, 5).map((f) => ({ form: f.form_type ?? "Filing", date: f.filing_date ?? null, url: f.filing_url ?? null })));
      })
      .catch(() => { if (alive) setFilings([]); });
    return () => { alive = false; };
  }, [ticker]);

  const submitEdit = async (f: FormState) => {
    if (!firmFund) return;
    setEditBusy(true); setEditError(null);
    try {
      const r = await fetch("/api/firm-funds", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update", id: firmFund.id, status: f.status,
          fundRole: f.fundRole || null, approvalRationale: f.approvalRationale || null,
          nextReviewDate: f.nextReviewDate || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setEditError(d.error || "Could not save changes."); return; }
      setEditOpen(false); await load();
    } finally { setEditBusy(false); }
  };

  if (state === "loading") return <Section title="Firm context"><span style={{ color: T.muted, ...ui, fontSize: 12.5 }}>Loading firm context…</span></Section>;
  if (state === "signedout") return null;                 // anon/non-firm → canonical analysis only
  if (state === "error") return <Section title="Firm context"><span style={{ color: T.muted, ...ui, fontSize: 12.5 }}>Firm context is unavailable right now.</span></Section>;

  const lastCompleted = reviews.find((r) => r.status === "completed" && r.completed_date)?.completed_date ?? null;

  const backBtn = cameFromFirmFunds && onBack ? (
    <button onClick={onBack} style={{ border: `1px solid ${T.line2}`, background: "transparent", color: T.dim,
      borderRadius: 8, padding: "5px 11px", fontSize: 12, fontWeight: 600, ...ui, cursor: "pointer" }}>← Back to Firm Funds</button>
  ) : null;

  // ── Not in the firm's inventory ──
  if (!firmFund) {
    return (
      <Section title="Firm context" action={backBtn}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: T.dim, ...ui }}>{ticker} is not in your Firm Funds inventory.</span>
          {onAddToFirmFunds && (
            <button onClick={() => onAddToFirmFunds(ticker)} style={{ border: "none", background: T.blue, color: "#fff",
              borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, ...ui, cursor: "pointer" }}>+ Add to Firm Funds</button>
          )}
        </div>
      </Section>
    );
  }

  // ── In the firm's inventory ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Section title="Firm context" action={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {backBtn}
          <button onClick={() => { setEditError(null); setEditOpen(true); }}
            style={{ border: `1px solid ${T.line2}`, background: "transparent", color: T.dim, borderRadius: 8,
              padding: "5px 11px", fontSize: 12, fontWeight: 600, ...ui, cursor: "pointer" }}>Edit firm fields</button>
          {onStartReview && (
            <button onClick={() => onStartReview(firmFund.id, ticker)}
              style={{ border: "none", background: T.blue, color: "#fff", borderRadius: 8,
                padding: "6px 13px", fontSize: 12.5, fontWeight: 600, ...ui, cursor: "pointer" }}>Start Review</button>
          )}
        </div>
      }>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
          <Field label="Firm status"><StatusBadge status={firmFund.status} /></Field>
          <Field label="Firm role">{firmFund.fund_role ?? "—"}</Field>
          <Field label="Last completed review">{lastCompleted ?? "None yet"}</Field>
          <Field label="Next review">{firmFund.next_review_date ?? "—"}</Field>
          <Field label="Models"><NotConnected title="No model relationship is configured yet." /></Field>
          <Field label="Alerts"><NotConnected title="No alert relationship is configured yet." /></Field>
        </div>
        {firmFund.approval_rationale && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10.5, color: T.muted, ...ui, marginBottom: 3 }}>Approval rationale</div>
            <div style={{ fontSize: 12.5, color: T.text, ...ui, lineHeight: 1.55 }}>{firmFund.approval_rationale}</div>
          </div>
        )}
      </Section>

      {/* Review history — read-only */}
      <Section title="Review history">
        {reviews.length === 0 ? (
          <span style={{ color: T.muted, ...ui, fontSize: 12.5 }}>No reviews yet for this fund.</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reviews.map((rv) => (
              <div key={rv.id} style={{ border: `1px solid ${T.line}`, borderRadius: 9, padding: "11px 13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text, ...ui }}>{REVIEW_STATUS_LABEL[rv.status]}
                    {rv.decision && <span style={{ color: T.dim, fontWeight: 500 }}> · {rv.decision}</span>}
                  </span>
                  <span style={{ fontSize: 11, color: T.muted, ...mono }}>
                    Opened {rv.opened_date}{rv.completed_date ? ` · Completed ${rv.completed_date}` : rv.review_date ? ` · Target ${rv.review_date}` : ""}
                  </span>
                </div>
                {rv.reason && <div style={{ fontSize: 12, color: T.dim, ...ui, marginTop: 5 }}>{rv.reason}</div>}
                {rv.rationale && <div style={{ fontSize: 12, color: T.text, ...ui, marginTop: 5, lineHeight: 1.5 }}>{rv.rationale}</div>}
                <div style={{ fontSize: 10.5, color: T.muted, ...ui, marginTop: 6 }}>
                  {rv.assigned_reviewer ? "Reviewer assigned" : "Unassigned"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Fund-specific evidence — existing SEC filings source only */}
      <Section title="Recent filings · SEC EDGAR">
        {filings === null ? (
          <span style={{ color: T.muted, ...ui, fontSize: 12.5 }}>Loading filings…</span>
        ) : filings.length === 0 ? (
          <span style={{ color: T.muted, ...ui, fontSize: 12.5 }}>No fund filings available.</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {filings.map((f, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, ...ui }}>
                <span style={{ color: T.text, fontWeight: 600 }}>
                  {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: T.blue, textDecoration: "none" }}>{f.form}</a> : f.form}
                </span>
                <span style={{ color: T.muted, ...mono }}>{f.date ?? "—"}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {editOpen && (
        <FundDialog mode="edit" busy={editBusy} error={editError}
          initial={{ ticker, status: firmFund.status, fundRole: firmFund.fund_role ?? "",
            approvalRationale: firmFund.approval_rationale ?? "", nextReviewDate: firmFund.next_review_date ?? "" }}
          onClose={() => setEditOpen(false)} onSubmit={submitEdit} />
      )}
    </div>
  );
}
