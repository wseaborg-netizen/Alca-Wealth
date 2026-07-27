"use client";
import React, { useCallback, useEffect, useState } from "react";
import { T, ui, mono } from "./tokens";

/**
 * Review detail workspace (Phase 2E) — fund context, review info, candidates,
 * comparison hand-off, evidence, and completion/cancel. All mutations go through
 * the firm-scoped /api/reviews/[id] endpoint; completed/cancelled reviews render
 * read-only. Candidate scores are never invented; comparison reuses Discover;
 * comparison_snapshot is left null (no fabricated snapshots). Models affected has
 * no reliable relationship → "Not connected".
 */

const DECISIONS = ["keep", "watch", "replace", "restrict", "retire"] as const;
type Decision = (typeof DECISIONS)[number];

interface Review {
  id: string; status: "open" | "in_review" | "completed" | "cancelled";
  reason: string | null; assigned_reviewer: string | null; opened_date: string;
  review_date: string | null; completed_date: string | null; decision: string | null;
  rationale: string | null; effective_date: string | null; next_review_date: string | null;
}
interface Candidate { id: string; normalized_ticker: string; display_order: number; notes: string | null; selected: boolean }
interface Evidence { id: string; evidence_type: string; title: string | null; source_reference: string | null; as_of_date: string | null }
interface FundCtx { firmFundId: string; ticker: string; name: string | null; vehicle: string | null; category: string | null; benchmark: string | null; status: string; fundRole: string | null; approvalRationale: string | null; nextReviewDate: string | null }
interface Detail { review: Review; candidates: Candidate[]; evidence: Evidence[]; fund: FundCtx | null }

const field: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.line2}`, background: T.panel, color: T.text, fontSize: 12.5, ...ui, boxSizing: "border-box" };
const lab = (t: string) => <span style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: T.muted, ...ui, marginBottom: 4 }}>{t}</span>;
const Card = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "16px 18px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</span>{action}
    </div>{children}
  </div>
);
const btn = (bg: string, fg: string): React.CSSProperties => ({ border: bg === "transparent" ? `1px solid ${T.line2}` : "none", background: bg, color: fg, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, ...ui, cursor: "pointer" });

export default function ReviewDetail({ id, onBack, onAnalyze, onCompareCandidates }: {
  id: string; onBack: () => void; onAnalyze?: (t: string) => void; onCompareCandidates?: (tickers: string[]) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);
  const [candTicker, setCandTicker] = useState("");
  const [candNotes, setCandNotes] = useState("");
  const [ev, setEv] = useState({ evidenceType: "note", title: "", sourceReference: "", asOfDate: "" });
  const [info, setInfo] = useState({ rationale: "", effectiveDate: "", nextReviewDate: "", assignedReviewer: "" });
  const [comp, setComp] = useState({ decision: "keep" as Decision, rationale: "", completedDate: "", effectiveDate: "", nextReviewDate: "" });
  const [showComplete, setShowComplete] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/reviews/${id}`, { cache: "no-store" });
      if (!r.ok) throw new Error("load");
      const d = await r.json();
      const det = d.detail as Detail;
      setDetail(det); setState("ready");
      setInfo({ rationale: det.review.rationale ?? "", effectiveDate: det.review.effective_date ?? "",
        nextReviewDate: det.review.next_review_date ?? "", assignedReviewer: det.review.assigned_reviewer ?? "" });
    } catch { setState("error"); }
  }, [id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setState("loading"); void load(); }, [load]);

  const act = async (body: Record<string, unknown>): Promise<boolean> => {
    setErr(null);
    const r = await fetch(`/api/reviews/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error || "Action failed."); return false; }
    await load(); return true;
  };

  if (state === "loading") return <div style={{ padding: 40, textAlign: "center", color: T.muted, ...ui }}>Loading review…</div>;
  if (state === "error" || !detail) return <div style={{ padding: 24, ...ui }}><button onClick={onBack} style={btn("transparent", T.dim)}>← Back</button><div style={{ marginTop: 14, color: T.muted }}>This review is unavailable.</div></div>;

  const { review, candidates, evidence, fund } = detail;
  const closed = review.status === "completed" || review.status === "cancelled";
  const selectedCount = candidates.filter((c) => c.selected).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={onBack} style={btn("transparent", T.dim)}>← Back to Reviews</button>
        <span style={{ fontSize: 12, fontWeight: 700, color: WORKFLOW_COLOR(review.status), ...ui }}>{review.status.replace("_", " ").toUpperCase()}{closed ? " · read-only" : ""}</span>
      </div>
      {err && <div role="alert" style={{ background: "rgba(180,35,24,0.06)", border: "1px solid rgba(180,35,24,0.25)", borderRadius: 10, padding: "10px 14px", color: "#B42318", ...ui, fontSize: 12.5 }}>{err}</div>}

      {/* 1. Fund context */}
      <Card title="Fund" action={fund && onAnalyze ? <button onClick={() => onAnalyze(fund.ticker)} style={btn("transparent", T.blue)}>Open workspace</button> : null}>
        {fund ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
            <div><span style={{ fontSize: 16, fontWeight: 700, color: T.text, ...mono }}>{fund.ticker}</span><div style={{ fontSize: 12, color: T.dim, ...ui }}>{fund.name ?? "Unavailable"}</div></div>
            <div>{lab("Firm status")}<span style={{ fontSize: 12.5, color: T.text, ...ui }}>{fund.status}</span></div>
            <div>{lab("Firm role")}<span style={{ fontSize: 12.5, color: T.text, ...ui }}>{fund.fundRole ?? "—"}</span></div>
            <div>{lab("Next review")}<span style={{ fontSize: 12.5, color: T.text, ...ui }}>{fund.nextReviewDate ?? "—"}</span></div>
            {fund.approvalRationale && <div style={{ gridColumn: "1/-1" }}>{lab("Approval rationale")}<span style={{ fontSize: 12, color: T.text, ...ui }}>{fund.approvalRationale}</span></div>}
          </div>
        ) : <span style={{ color: T.muted, ...ui, fontSize: 12.5 }}>Fund context unavailable.</span>}
      </Card>

      {/* 2. Review information */}
      <Card title="Review information">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <div style={{ gridColumn: "1/-1" }}>{lab("Reason")}<span style={{ fontSize: 12.5, color: T.text, ...ui }}>{review.reason ?? "—"}</span></div>
          <div>{lab("Assigned reviewer")}<span style={{ fontSize: 12.5, color: T.text, ...ui }}>{review.assigned_reviewer ? "Assigned" : "Unassigned"}</span></div>
          <div>{lab("Opened")}<span style={{ fontSize: 12.5, color: T.text, ...mono }}>{review.opened_date}</span></div>
          <div>{lab("Target review")}<span style={{ fontSize: 12.5, color: T.text, ...mono }}>{review.review_date ?? "—"}</span></div>
        </div>
        {!closed ? (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <label>{lab("Rationale draft")}<textarea value={info.rationale} onChange={(e) => setInfo({ ...info, rationale: e.target.value })} rows={2} style={{ ...field, resize: "vertical" }} /></label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ flex: 1, minWidth: 130 }}>{lab("Effective date")}<input type="date" value={info.effectiveDate} onChange={(e) => setInfo({ ...info, effectiveDate: e.target.value })} style={field} /></label>
              <label style={{ flex: 1, minWidth: 130 }}>{lab("Next review date")}<input type="date" value={info.nextReviewDate} onChange={(e) => setInfo({ ...info, nextReviewDate: e.target.value })} style={field} /></label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => act({ action: "update", rationale: info.rationale || null, effectiveDate: info.effectiveDate || null, nextReviewDate: info.nextReviewDate || null })} style={btn(T.blue, "#fff")}>Save</button>
              {review.status === "open" && <button onClick={() => act({ action: "update", status: "in_review" })} style={btn("transparent", T.dim)}>Mark in review</button>}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <div>{lab("Decision")}<span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, ...ui }}>{review.decision ?? "—"}</span></div>
            <div>{lab("Completed")}<span style={{ fontSize: 12.5, color: T.text, ...mono }}>{review.completed_date ?? "—"}</span></div>
            <div>{lab("Effective")}<span style={{ fontSize: 12.5, color: T.text, ...mono }}>{review.effective_date ?? "—"}</span></div>
            <div>{lab("Next review")}<span style={{ fontSize: 12.5, color: T.text, ...mono }}>{review.next_review_date ?? "—"}</span></div>
            {review.rationale && <div style={{ gridColumn: "1/-1" }}>{lab("Decision rationale")}<span style={{ fontSize: 12, color: T.text, ...ui }}>{review.rationale}</span></div>}
          </div>
        )}
      </Card>

      {/* 3. Candidates */}
      <Card title="Candidates" action={onCompareCandidates && fund && (candidates.length > 0) ? <button onClick={() => onCompareCandidates([fund.ticker, ...candidates.map((c) => c.normalized_ticker)])} style={btn("transparent", T.blue)}>Compare in Discover</button> : null}>
        {candidates.length === 0 ? <span style={{ color: T.muted, ...ui, fontSize: 12.5 }}>No candidates added.</span> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {candidates.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${c.selected ? T.blue : T.line}`, borderRadius: 8, padding: "9px 11px" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, ...mono }}>{c.normalized_ticker}</span>
                {c.notes && <span style={{ fontSize: 11.5, color: T.dim, ...ui, flex: 1 }}>{c.notes}</span>}
                <span style={{ flex: c.notes ? 0 : 1 }} />
                {c.selected && <span style={{ fontSize: 10.5, fontWeight: 700, color: T.blue, ...ui }}>SELECTED</span>}
                {!closed && (<>
                  <button onClick={() => act({ action: "candidateSelect", candidateId: c.selected ? null : c.id })} style={btn("transparent", c.selected ? T.dim : T.blue)}>{c.selected ? "Unselect" : "Select"}</button>
                  <button onClick={() => act({ action: "candidateRemove", candidateId: c.id })} style={btn("transparent", T.muted)}>Remove</button>
                </>)}
              </div>
            ))}
          </div>
        )}
        {!closed && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ flex: "0 0 120px" }}>{lab("Add ticker")}<input value={candTicker} onChange={(e) => setCandTicker(e.target.value.toUpperCase())} placeholder="e.g. IVV" style={field} /></label>
            <label style={{ flex: 1, minWidth: 140 }}>{lab("Notes (optional)")}<input value={candNotes} onChange={(e) => setCandNotes(e.target.value)} style={field} /></label>
            <button onClick={async () => { if (await act({ action: "candidateAdd", ticker: candTicker, notes: candNotes || null })) { setCandTicker(""); setCandNotes(""); } }} disabled={!candTicker.trim()} style={btn(T.blue, "#fff")}>Add candidate</button>
          </div>
        )}
        {selectedCount > 1 && <div style={{ marginTop: 8, fontSize: 11, color: "#B42318", ...ui }}>Only one candidate can be selected.</div>}
      </Card>

      {/* 4. Evidence */}
      <Card title="Evidence">
        {evidence.length === 0 ? <span style={{ color: T.muted, ...ui, fontSize: 12.5 }}>No evidence added.</span> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {evidence.map((e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${T.line}`, borderRadius: 8, padding: "9px 11px" }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: T.blue, ...ui, textTransform: "uppercase" }}>{e.evidence_type}</span>
                <span style={{ fontSize: 12.5, color: T.text, ...ui, flex: 1 }}>{e.title ?? e.source_reference ?? "—"}</span>
                {e.as_of_date && <span style={{ fontSize: 11, color: T.muted, ...mono }}>{e.as_of_date}</span>}
                {!closed && <button onClick={() => act({ action: "evidenceRemove", evidenceId: e.id })} style={btn("transparent", T.muted)}>Remove</button>}
              </div>
            ))}
          </div>
        )}
        {!closed && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ flex: "0 0 110px" }}>{lab("Type")}<input value={ev.evidenceType} onChange={(e) => setEv({ ...ev, evidenceType: e.target.value })} style={field} /></label>
            <label style={{ flex: 1, minWidth: 130 }}>{lab("Title")}<input value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} style={field} /></label>
            <label style={{ flex: 1, minWidth: 130 }}>{lab("Source reference")}<input value={ev.sourceReference} onChange={(e) => setEv({ ...ev, sourceReference: e.target.value })} style={field} /></label>
            <label style={{ flex: "0 0 130px" }}>{lab("As-of date")}<input type="date" value={ev.asOfDate} onChange={(e) => setEv({ ...ev, asOfDate: e.target.value })} style={field} /></label>
            <button onClick={async () => { if (await act({ action: "evidenceAdd", evidenceType: ev.evidenceType || "note", title: ev.title || null, sourceReference: ev.sourceReference || null, asOfDate: ev.asOfDate || null })) setEv({ evidenceType: "note", title: "", sourceReference: "", asOfDate: "" }); }} disabled={!ev.evidenceType.trim()} style={btn(T.blue, "#fff")}>Add evidence</button>
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 11, color: T.muted, ...ui }}>Evidence is manually supplied. External evidence is never auto-ingested.</div>
      </Card>

      {/* 5. Models affected */}
      <Card title="Models affected"><span style={{ color: T.muted, ...ui, fontSize: 12.5 }} title="No review-to-model relationship exists yet.">Not connected</span></Card>

      {/* 6. Completion / cancel */}
      {!closed && (
        <Card title="Complete or cancel" action={<button onClick={() => act({ action: "cancel" })} style={btn("transparent", "#B42318")}>Cancel review</button>}>
          {!showComplete ? (
            <button onClick={() => setShowComplete(true)} style={btn(T.blue, "#fff")}>Complete review…</button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ flex: 1, minWidth: 140 }}>{lab("Decision")}
                  <select value={comp.decision} onChange={(e) => setComp({ ...comp, decision: e.target.value as Decision })} style={field}>
                    {DECISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
                <label style={{ flex: 1, minWidth: 140 }}>{lab("Completed date")}<input type="date" value={comp.completedDate} onChange={(e) => setComp({ ...comp, completedDate: e.target.value })} style={field} /></label>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ flex: 1, minWidth: 140 }}>{lab("Effective date")}<input type="date" value={comp.effectiveDate} onChange={(e) => setComp({ ...comp, effectiveDate: e.target.value })} style={field} /></label>
                <label style={{ flex: 1, minWidth: 140 }}>{lab("Next review date")}<input type="date" value={comp.nextReviewDate} onChange={(e) => setComp({ ...comp, nextReviewDate: e.target.value })} style={field} /></label>
              </div>
              <label>{lab("Decision rationale")}<textarea value={comp.rationale} onChange={(e) => setComp({ ...comp, rationale: e.target.value })} rows={2} style={{ ...field, resize: "vertical" }} /></label>
              {comp.decision === "replace" && selectedCount !== 1 && <div style={{ fontSize: 11.5, color: "#B45309", ...ui }}>A replace decision requires exactly one selected candidate.</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => act({ action: "complete", decision: comp.decision, rationale: comp.rationale || null, completedDate: comp.completedDate || null, effectiveDate: comp.effectiveDate || null, nextReviewDate: comp.nextReviewDate || null })}
                  disabled={comp.decision === "replace" && selectedCount !== 1} style={btn(T.blue, "#fff")}>Complete review</button>
                <button onClick={() => setShowComplete(false)} style={btn("transparent", T.dim)}>Cancel</button>
              </div>
              <div style={{ fontSize: 11, color: T.muted, ...ui }}>Recording a decision does not change the fund&apos;s firm status — update that separately in Firm Funds.</div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function WORKFLOW_COLOR(s: Review["status"]): string {
  return s === "open" ? "#0E7490" : s === "in_review" ? "#B45309" : s === "completed" ? "#047857" : "#5B6472";
}
