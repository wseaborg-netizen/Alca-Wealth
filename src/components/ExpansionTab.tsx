"use client";
/**
 * Expansion Hub — add funds to Alca's universe (internal, signed-in firm users).
 *
 * Add Fund → POST /api/fund-requests (normalize → merged-universe check → FMP →
 * classify → store verified dynamic fund). Shows request status, the merged
 * universe counts, recently added funds, and the System Health cards. It never
 * fakes an add: unclear funds surface as "Needs review", not green.
 */
import React, { useCallback, useEffect, useState } from "react";
import { T, ui, mono } from "./tokens";
import { Btn, Card, Label, Spinner } from "./ui";
import { SaveToList } from "./SaveToList";
import { refreshMergedUniverse } from "@/lib/universeClient";

type ReqStatus =
  | "pending" | "already_available" | "fmp_supported" | "needs_classification" | "ready_for_review"
  | "approved" | "rejected" | "unsupported" | "classification_failed" | "added_to_universe" | "failed_validation";

interface FundRequest {
  id: string; ticker: string; normalized_ticker: string; status: ReqStatus;
  fund_name: string | null; fmp_supported: boolean; classification_status: string | null;
  failure_reason: string | null; requested_at: string;
}
interface Counts { static: number; dynamic: number; merged: number }
interface RecentFund { ticker: string; fund_name: string; category: string | null; vehicle: string | null; created_at: string }
interface HealthCheck { key: string; label: string; status: "healthy" | "warning" | "error"; summary: string }

const TONE: Record<"healthy" | "warning" | "error", string> = { healthy: "#22c55e", warning: "#f59e0b", error: "#ef4444" };
const STATUS_TONE: Record<ReqStatus, "healthy" | "warning" | "error" | "info"> = {
  added_to_universe: "healthy", approved: "healthy", already_available: "info",
  needs_classification: "warning", ready_for_review: "warning", pending: "warning", fmp_supported: "info",
  unsupported: "error", classification_failed: "error", failed_validation: "error", rejected: "error",
};
const STATUS_LABEL: Record<ReqStatus, string> = {
  pending: "Pending — retry", already_available: "Already available", fmp_supported: "Provider supported",
  needs_classification: "Needs review", ready_for_review: "Awaiting review", approved: "Approved",
  rejected: "Rejected", unsupported: "Unsupported", classification_failed: "Classifier error",
  added_to_universe: "Added to Alca", failed_validation: "Failed validation",
};
const dotColor = (s: ReqStatus) => ({ healthy: "#22c55e", warning: "#f59e0b", error: "#ef4444", info: T.blue }[STATUS_TONE[s]]);

function StatusPill({ status }: { status: ReqStatus }) {
  const c = dotColor(status);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700,
      color: c, background: `${c}18`, border: `1px solid ${c}44`, borderRadius: 999, padding: "2px 9px", ...ui, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />{STATUS_LABEL[status]}
    </span>
  );
}

interface AddResult {
  status: ReqStatus; ticker: string; fundName: string | null; category: string | null;
  reason: string | null; duplicate?: boolean;
}

export default function ExpansionTab({ onAnalyze }: { onAnalyze?: (t: string) => void }) {
  const [signedOut, setSignedOut] = useState(false);
  const [ticker, setTicker] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AddResult | null>(null);
  const [requests, setRequests] = useState<FundRequest[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [recent, setRecent] = useState<RecentFund[]>([]);
  const [health, setHealth] = useState<HealthCheck[] | null>(null);

  const loadAll = useCallback(async () => {
    const [rq, sum, hl] = await Promise.allSettled([
      fetch("/api/fund-requests", { cache: "no-store" }),
      fetch("/api/expansion", { cache: "no-store" }),
      fetch("/api/health/system", { cache: "no-store" }),
    ]);
    if (rq.status === "fulfilled") {
      if (rq.value.status === 401) { setSignedOut(true); return; }
      const d = await rq.value.json(); setRequests((d.requests ?? []) as FundRequest[]);
    }
    if (sum.status === "fulfilled" && sum.value.ok) {
      const d = await sum.value.json(); setCounts(d.counts ?? null); setRecent((d.recent ?? []) as RecentFund[]);
    }
    if (hl.status === "fulfilled" && hl.value.ok) {
      const d = await hl.value.json(); setHealth((d.checks ?? []) as HealthCheck[]);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const submit = async () => {
    const t = ticker.trim();
    if (!t || submitting) return;
    setSubmitting(true); setResult(null);
    try {
      const r = await fetch("/api/fund-requests", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: t }),
      });
      if (r.status === 401) { setSignedOut(true); return; }
      const d = await r.json();
      if (!r.ok && !d.status) { setResult({ status: "unsupported", ticker: t.toUpperCase(), fundName: null, category: null, reason: d.error ?? "Request failed." }); return; }
      const fund = d.fund ?? d.request ?? null;
      setResult({
        status: (d.status ?? "pending") as ReqStatus, ticker: t.toUpperCase(),
        fundName: fund?.name ?? fund?.fund_name ?? null, category: fund?.category ?? null,
        reason: d.request?.failure_reason ?? null, duplicate: d.duplicate,
      });
      setTicker("");
      // A newly verified fund joined the universe → invalidate the shared client
      // cache so Research/Screen/model pick it up without a redeploy or refresh.
      if (d.status === "added_to_universe") void refreshMergedUniverse();
      await loadAll();
    } catch {
      setResult({ status: "pending", ticker: t.toUpperCase(), fundName: null, category: null, reason: "Could not reach the server. Try again." });
    } finally { setSubmitting(false); }
  };

  if (signedOut) return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <Card style={{ padding: "26px 28px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, ...ui }}>Sign in to use the Expansion Hub</div>
        <p style={{ fontSize: 13, color: T.dim, ...ui, margin: "8px 0 0", lineHeight: 1.6 }}>
          Adding funds and viewing request status is limited to signed-in firm users. This is an internal tool.
        </p>
        <a href="/login" style={{ display: "inline-block", marginTop: 14, padding: "10px 18px", borderRadius: 9,
          background: T.blue, color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none", ...ui }}>Sign in</a>
      </Card>
    </div>
  );

  const analyzable = result && (result.status === "added_to_universe" || result.status === "already_available");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1280, margin: "0 auto" }}>
      <div>
        <h1 style={{ fontSize: 27, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.02em" }}>Expansion</h1>
        <p style={{ fontSize: 14, color: T.dim, ...ui, margin: "7px 0 0", lineHeight: 1.5 }}>
          Add funds to Alca. A submitted ticker is checked against the universe and the data provider, then
          classified with Alca’s taxonomy. Confirmed funds become usable immediately; unclear ones are queued for review.
        </p>
      </div>

      {/* Universe status summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {[
          { label: "Verified funds (merged)", value: counts?.merged, hi: true },
          { label: "Static base", value: counts?.static },
          { label: "Added dynamically", value: counts?.dynamic },
          { label: "Needs review", value: requests?.filter((r) => r.status === "needs_classification" || r.status === "ready_for_review").length },
          { label: "Unsupported", value: requests?.filter((r) => r.status === "unsupported").length },
        ].map((s) => (
          <Card key={s.label} style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.hi ? T.data : T.text, ...mono }}>
              {s.value == null ? "—" : s.value.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: T.muted, ...ui, marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Add Fund */}
      <Card style={{ padding: "18px 22px" }}>
        <Label>Add a fund</Label>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input value={ticker} placeholder="Ticker (e.g. SCHD)" autoCapitalize="characters" spellCheck={false}
            onChange={(e) => setTicker(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            style={{ padding: "10px 13px", borderRadius: 9, border: `1px solid ${T.line2}`, background: T.panel,
              color: T.text, fontSize: 14, ...mono, outline: "none", width: 200, textTransform: "uppercase" }} />
          <Btn onClick={() => void submit()} disabled={!ticker.trim() || submitting}>
            {submitting ? "Checking…" : "Add Fund"}
          </Btn>
        </div>

        {submitting && <div style={{ marginTop: 12 }}><Spinner label="Checking universe, provider, and classification…" /></div>}

        {result && !submitting && (
          <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, border: `1px solid ${dotColor(result.status)}44`,
            background: `${dotColor(result.status)}0f` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text, ...mono }}>{result.ticker}</span>
              <StatusPill status={result.status} />
              {result.duplicate && <span style={{ fontSize: 11, color: T.muted, ...ui }}>already requested</span>}
            </div>
            {result.fundName && <div style={{ fontSize: 12.5, color: T.dim, ...ui, marginTop: 6 }}>
              {result.fundName}{result.category ? ` · ${result.category}` : ""}
            </div>}
            {result.reason && <div style={{ fontSize: 12, color: T.dim, ...ui, marginTop: 6, lineHeight: 1.5 }}>{result.reason}</div>}
            {result.status === "added_to_universe" && <div style={{ fontSize: 12, color: T.dim, ...ui, marginTop: 6 }}>
              Classified and added — it’s now screenable and analyzable.
            </div>}
            {analyzable && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                {onAnalyze && <button onClick={() => onAnalyze(result!.ticker)}
                  style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: T.blue, color: "#fff",
                    fontSize: 12, fontWeight: 600, cursor: "pointer", ...ui }}>Analyze</button>}
                <SaveToList ticker={result.ticker} fundName={result.fundName ?? undefined} category={result.category ?? undefined} />
              </div>
            )}
          </div>
        )}
        <p style={{ fontSize: 11, color: T.muted, ...ui, margin: "12px 0 0", lineHeight: 1.55 }}>
          Provider support and classification are validated automatically. Funds the classifier can’t confidently
          place are held as “Needs review” — never added on a guess.
        </p>
      </Card>

      {/* Requests table */}
      <Card style={{ padding: "18px 22px" }}>
        <Label>Fund requests</Label>
        {requests == null ? <div style={{ marginTop: 10 }}><Spinner label="Loading requests…" /></div>
          : requests.length === 0 ? (
            <p style={{ fontSize: 12.5, color: T.muted, ...ui, margin: "10px 0 0" }}>No requests yet. Add a ticker above to get started.</p>
          ) : (
            <div style={{ marginTop: 10, overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
                <thead><tr>
                  {["Ticker", "Fund", "Status", "FMP", "Classification", "Requested", ""].map((h, i) => (
                    <th key={i} style={{ textAlign: "left", fontSize: 10, color: T.muted, ...ui, padding: "2px 14px 6px 0",
                      fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} style={{ borderTop: `1px solid ${T.line}` }}>
                      <td style={{ padding: "8px 14px 8px 0" }}><span style={{ fontSize: 12.5, fontWeight: 700, color: T.blue, ...mono }}>{r.normalized_ticker}</span></td>
                      <td style={{ padding: "8px 14px 8px 0", fontSize: 11.5, color: T.dim, ...ui, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fund_name ?? "—"}</td>
                      <td style={{ padding: "8px 14px 8px 0" }}><StatusPill status={r.status} /></td>
                      <td style={{ padding: "8px 14px 8px 0", fontSize: 11.5, color: T.dim, ...ui }}>{r.fmp_supported ? "Yes" : "—"}</td>
                      <td style={{ padding: "8px 14px 8px 0", fontSize: 11.5, color: T.dim, ...ui }}>{r.classification_status ?? "—"}</td>
                      <td style={{ padding: "8px 14px 8px 0", fontSize: 11, color: T.muted, ...ui, whiteSpace: "nowrap" }}>{new Date(r.requested_at).toLocaleDateString()}</td>
                      <td style={{ padding: "8px 0", whiteSpace: "nowrap" }}>
                        {(r.status === "added_to_universe" || r.status === "already_available") && onAnalyze && (
                          <button onClick={() => onAnalyze(r.normalized_ticker)}
                            style={{ padding: "5px 10px", borderRadius: 7, border: "none", background: T.blue, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", ...ui }}>Analyze</button>
                        )}
                        {r.failure_reason && r.status !== "added_to_universe" && (
                          <span title={r.failure_reason} style={{ fontSize: 11, color: T.muted, ...ui, cursor: "help" }}>ⓘ reason</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      {/* Recently added */}
      {recent.length > 0 && (
        <Card style={{ padding: "18px 22px" }}>
          <Label>Recently added</Label>
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {recent.map((f) => (
              <div key={f.ticker} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 11px",
                border: `1px solid ${T.line2}`, borderRadius: 9, background: T.panel }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.blue, ...mono }}>{f.ticker}</span>
                <span style={{ fontSize: 11, color: T.muted, ...ui }}>{f.category ?? f.vehicle ?? ""}</span>
                {onAnalyze && <button onClick={() => onAnalyze(f.ticker)}
                  style={{ border: "none", background: "none", color: T.blue, fontSize: 11, fontWeight: 600, cursor: "pointer", ...ui }}>Analyze</button>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Data & system health (reuses /api/health/system) */}
      <Card style={{ padding: "18px 22px" }}>
        <Label>Data &amp; system health</Label>
        {health == null ? <div style={{ marginTop: 10 }}><Spinner label="Checking systems…" /></div> : (
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            {health.map((c) => (
              <div key={c.key} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 11px",
                border: `1px solid ${T.line2}`, borderRadius: 9, background: T.panel }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: TONE[c.status], marginTop: 4, flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text, ...ui }}>{c.label}</span>
                  <span style={{ display: "block", fontSize: 11, color: T.dim, ...ui, marginTop: 1, lineHeight: 1.4 }}>{c.summary}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
