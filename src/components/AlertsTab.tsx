"use client";
/**
 * Alerts — SEC filing monitoring for saved funds (internal, signed-in).
 * Sections: Alert Feed · SEC Monitoring Status · Monitored Saved Funds ·
 * Refresh SEC Alerts. Real SEC filings only — no fake alerts, no generic news.
 */
import React, { useCallback, useEffect, useState } from "react";
import { T, ui, mono } from "./tokens";
import { Btn, Card, Label, Spinner } from "./ui";

interface Alert {
  id: string; alert_type: string; severity: "info" | "watch" | "warning" | "critical";
  status: "unread" | "read" | "archived"; source: string; ticker: string | null; fund_name: string | null;
  title: string; summary: string | null; reason: string | null; action_label: string | null;
  action_href: string | null; created_at: string;
}
interface Monitored {
  id: string; normalized_ticker: string; entity_name: string | null; cik: string | null;
  cik_source: string; active: boolean; last_success_at: string | null; last_error: string | null;
}
interface RefreshResult { ok: boolean; reason?: string; monitored: number; checked: number; newFilings: number; newAlerts: number; unresolved: number; errors: number }

const SEV_TONE: Record<Alert["severity"], string> = { info: "#3b82f6", watch: "#f59e0b", warning: "#f59e0b", critical: "#ef4444" };

export default function AlertsTab({ onAnalyze }: { onAnalyze?: (t: string) => void }) {
  const [signedOut, setSignedOut] = useState(false);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [monitored, setMonitored] = useState<Monitored[]>([]);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/alerts", { cache: "no-store" });
    if (r.status === 401) { setSignedOut(true); return; }
    const d = await r.json();
    setAlerts((d.alerts ?? []) as Alert[]);
    setMonitored((d.monitored ?? []) as Monitored[]);
    setUnread(d.counts?.unread ?? 0);
  }, []);

  useEffect(() => { void load().catch(() => {}); }, [load]);

  const refresh = async () => {
    setRefreshing(true); setRefreshMsg(null);
    try {
      const r = await fetch("/api/monitoring/sec/refresh", { method: "POST" });
      const d = await r.json() as RefreshResult & { error?: string };
      if (!r.ok) { setRefreshMsg(d.error ?? d.reason ?? "SEC refresh unavailable."); return; }
      setRefreshMsg(`Checked ${d.checked} of ${d.monitored} monitored · ${d.newAlerts} new alert${d.newAlerts === 1 ? "" : "s"}${d.unresolved ? ` · ${d.unresolved} unresolved CIK` : ""}.`);
      await load();
    } catch { setRefreshMsg("Network error during refresh."); }
    finally { setRefreshing(false); }
  };

  const act = async (id: string, action: "read" | "archive") => {
    await fetch(`/api/alerts/${id}/${action}`, { method: "POST" }).catch(() => null);
    await load();
  };

  if (signedOut) return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <Card style={{ padding: "26px 28px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, ...ui }}>Sign in to use Alerts</div>
        <a href="/login" style={{ display: "inline-block", marginTop: 14, padding: "10px 18px", borderRadius: 9,
          background: T.blue, color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none", ...ui }}>Sign in</a>
      </Card>
    </div>
  );

  const active = monitored.filter((m) => m.active);
  const unresolved = active.filter((m) => !m.cik).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.02em" }}>Alerts</h1>
          <p style={{ fontSize: 14, color: T.dim, ...ui, margin: "7px 0 0", lineHeight: 1.5 }}>
            SEC filing activity for the funds in your saved lists. Real filings only — run a refresh to check for new ones.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {refreshMsg && <span style={{ fontSize: 11.5, color: T.dim, ...ui, maxWidth: 320, textAlign: "right" }}>{refreshMsg}</span>}
          <Btn onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh SEC Alerts"}</Btn>
        </div>
      </div>

      {/* SEC Monitoring Status */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {[
          { label: "Unread alerts", value: unread, hi: true },
          { label: "Monitored funds", value: active.length },
          { label: "Unresolved CIK", value: unresolved, warn: unresolved > 0 },
          { label: "Total alerts", value: alerts?.length ?? 0 },
        ].map((s) => (
          <Card key={s.label} style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.warn ? T.amber : s.hi ? T.data : T.text, ...mono }}>{s.value}</div>
            <div style={{ fontSize: 11, color: T.muted, ...ui, marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Alert Feed */}
      <Card style={{ padding: "18px 22px" }}>
        <Label>Alert feed</Label>
        {alerts == null ? <div style={{ marginTop: 10 }}><Spinner label="Loading alerts…" /></div>
          : alerts.length === 0 ? (
            <p style={{ fontSize: 12.5, color: T.muted, ...ui, margin: "10px 0 0", lineHeight: 1.6 }}>
              No alerts yet.{active.length === 0
                ? " Save funds to Watchlist or Commonly Used Funds to start monitoring."
                : " Run SEC refresh to check monitored saved funds for recent filings."}
            </p>
          ) : (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {alerts.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 13px",
                  border: `1px solid ${T.line2}`, borderRadius: 10, background: a.status === "unread" ? T.panel : "transparent" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEV_TONE[a.severity], marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {a.ticker && <span style={{ fontSize: 12.5, fontWeight: 700, color: T.blue, ...mono }}>{a.ticker}</span>}
                      <span style={{ fontSize: 12.5, fontWeight: a.status === "unread" ? 700 : 500, color: T.text, ...ui }}>{a.title}</span>
                      {a.status === "unread" && <span style={{ fontSize: 9.5, color: T.data, background: `${T.data}18`, borderRadius: 5, padding: "1px 6px", ...ui, fontWeight: 700 }}>NEW</span>}
                    </div>
                    {a.summary && <div style={{ fontSize: 11.5, color: T.dim, ...ui, marginTop: 3 }}>{a.summary}</div>}
                    <div style={{ fontSize: 10.5, color: T.muted, ...ui, marginTop: 4 }}>
                      {a.source === "sec_edgar" ? "SEC EDGAR" : a.source} · {new Date(a.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                    {a.action_href && <a href={a.action_href} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: T.blue, ...ui, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>{a.action_label ?? "View"} ↗</a>}
                    <div style={{ display: "flex", gap: 6 }}>
                      {a.status === "unread" && <button onClick={() => void act(a.id, "read")}
                        style={{ border: "none", background: "none", color: T.muted, fontSize: 10.5, cursor: "pointer", ...ui }}>Mark read</button>}
                      <button onClick={() => void act(a.id, "archive")}
                        style={{ border: "none", background: "none", color: T.muted, fontSize: 10.5, cursor: "pointer", ...ui }}>Archive</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </Card>

      {/* Monitored Saved Funds */}
      <Card style={{ padding: "18px 22px" }}>
        <Label>Monitored saved funds</Label>
        {active.length === 0 ? (
          <p style={{ fontSize: 12.5, color: T.muted, ...ui, margin: "10px 0 0" }}>
            Save funds to Watchlist or Commonly Used Funds to start monitoring.
          </p>
        ) : (
          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
              <thead><tr>{["Ticker", "Entity", "CIK", "Last checked", ""].map((h, i) => (
                <th key={i} style={{ textAlign: "left", fontSize: 10, color: T.muted, ...ui, padding: "2px 14px 6px 0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {active.map((m) => (
                  <tr key={m.id} style={{ borderTop: `1px solid ${T.line}` }}>
                    <td style={{ padding: "8px 14px 8px 0" }}><span style={{ fontSize: 12.5, fontWeight: 700, color: T.blue, ...mono }}>{m.normalized_ticker}</span></td>
                    <td style={{ padding: "8px 14px 8px 0", fontSize: 11.5, color: T.dim, ...ui, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.entity_name ?? "—"}</td>
                    <td style={{ padding: "8px 14px 8px 0", fontSize: 11.5, ...mono }}>
                      {m.cik ? <span style={{ color: T.dim }}>{m.cik}</span> : <span style={{ color: T.amber }} title={m.last_error ?? "No SEC CIK match"}>unresolved</span>}
                    </td>
                    <td style={{ padding: "8px 14px 8px 0", fontSize: 11, color: T.muted, ...ui, whiteSpace: "nowrap" }}>{m.last_success_at ? new Date(m.last_success_at).toLocaleDateString() : "—"}</td>
                    <td style={{ padding: "8px 0" }}>{onAnalyze && <button onClick={() => onAnalyze(m.normalized_ticker)}
                      style={{ padding: "5px 10px", borderRadius: 7, border: "none", background: T.blue, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", ...ui }}>Analyze</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ fontSize: 11, color: T.muted, ...ui, margin: "12px 0 0", lineHeight: 1.55 }}>
          Unresolved CIK means SEC EDGAR has no ticker→entity match yet — informational, not an error. SEC filing metadata only — factual filing activity, not investment advice.
        </p>
      </Card>
    </div>
  );
}
