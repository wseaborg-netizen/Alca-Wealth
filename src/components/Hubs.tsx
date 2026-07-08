"use client";
import React, { useEffect, useState } from "react";
import { T, ui, mono } from "./tokens";
import { PageHeader } from "./ui";
import { loadClients, riskLabel, type Client } from "../lib/client";

// Destinations the hub cards can route to (mapped to real tabs in FundGrid).
export type HubDest =
  | "discover" | "compare" | "analysis" | "watchlist" | "replacements"
  | "build" | "improve" | "portfolios" | "present" | "opportunity";

// ── Simple, consistent icons for the hub items ──
const mk = (p: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">{p}</svg>
);
const ICONS: Record<string, React.ReactNode> = {
  discover: mk(<><circle cx="7.2" cy="7.2" r="5" stroke="currentColor" strokeWidth="1.4" /><circle cx="7.2" cy="7.2" r="1.7" stroke="currentColor" strokeWidth="1.3" /><line x1="10.9" y1="10.9" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>),
  compare: mk(<><path d="M2 4h5v8H2zM9 2h5v10H9z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></>),
  analysis: mk(<><rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M5 9l2-2 1.5 1.5L11 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><line x1="5" y1="4" x2="11" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></>),
  watchlist: mk(<><path d="M8 2.5l1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 11.3l-3.4 1.7.7-3.8L2.5 6.5l3.8-.5L8 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></>),
  replace: mk(<><path d="M3 6a5 5 0 0 1 8.5-2.5M13 4v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M13 10a5 5 0 0 1-8.5 2.5M3 12V9h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></>),
  build: mk(<><path d="M8 1.8V8l5.4 3.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.4" /></>),
  portfolios: mk(<><rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><line x1="4.5" y1="6" x2="11.5" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><line x1="4.5" y1="8.5" x2="11.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><line x1="4.5" y1="11" x2="8.5" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></>),
  opportunity: mk(<><path d="M8 1.5a4.3 4.3 0 0 0-2.6 7.7c.4.3.6.8.6 1.3v.5h4v-.5c0-.5.2-1 .6-1.3A4.3 4.3 0 0 0 8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><line x1="6.4" y1="13.5" x2="9.6" y2="13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></>),
};

const SecLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11.5, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{children}</div>
);

// Row of quick-entry buttons (first is primary) - the one place each destination is a click away.
function QuickActions({ items, go }: { items: [string, HubDest][]; go: (d: HubDest) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {items.map(([label, dest], i) => (
        <button key={label} onClick={() => go(dest)} style={{
          padding: "9px 15px", borderRadius: 9, ...ui, fontSize: 13, fontWeight: 600, cursor: "pointer",
          border: `1px solid ${i === 0 ? T.blue : T.line2}`, background: i === 0 ? T.blue : T.panel, color: i === 0 ? "#fff" : T.dim,
        }}>{label}</button>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ background: T.panel, border: `1px dashed ${T.line2}`, borderRadius: 12, padding: "20px 22px",
      fontSize: 13, color: T.muted, ...ui, lineHeight: 1.55 }}>{text}</div>
  );
}

// Workstation panel - a quiet slot in the layout that will hold real content once
// it exists. No action buttons here on purpose: Quick Actions above is the only
// place navigation lives, so panels don't duplicate it.
function Panel({ iconKey, title, empty }: { iconKey: string; title: string; empty: string }) {
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12,
      boxShadow: "var(--c-card-shadow)", padding: "18px 20px", display: "flex", flexDirection: "column",
      gap: 12, minWidth: 0, minHeight: 138 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: T.panel3, border: `1px solid ${T.line2}`,
          color: T.dim, display: "flex", alignItems: "center", justifyContent: "center" }}>{ICONS[iconKey]}</span>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, ...ui }}>{title}</div>
      </div>
      <div style={{ fontSize: 12.5, color: T.muted, ...ui, lineHeight: 1.55 }}>{empty}</div>
    </div>
  );
}

const panelGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 };
const section: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };

// ── Research Hub - an investment research workstation, not a page of nav cards ──
export function ResearchHubTab({ go }: { go: (d: HubDest) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26, maxWidth: 1080 }}>
      <PageHeader title="Research"
        subtitle="Your investment research workstation - find, compare, and analyze the funds you'll actually use." />

      <div style={section}>
        <SecLabel>Quick actions</SecLabel>
        <QuickActions go={go} items={[["Discover Funds", "discover"], ["Compare Funds", "compare"], ["Analyze Fund", "analysis"], ["Watchlist", "watchlist"], ["Find Replacements", "replacements"]]} />
      </div>

      <div style={{ ...section, gap: 14 }}>
        <SecLabel>Your workstation</SecLabel>
        <div style={panelGrid}>
          <Panel iconKey="analysis" title="Recent Research"
            empty="Funds you've analyzed will appear here, with quick links back to the full breakdown." />
          <Panel iconKey="compare" title="Saved Comparisons"
            empty="Comparisons you save will show up here so you can revisit them without rebuilding from scratch." />
          <Panel iconKey="watchlist" title="Recently Viewed Funds"
            empty="The funds you've pulled up recently will be listed here for fast re-entry." />
          <Panel iconKey="replace" title="Replacement Opportunities"
            empty="Lower-cost or better-fit alternatives for the funds you track will surface here." />
        </div>
      </div>

      <div style={{ fontSize: 12, color: T.muted, ...ui }}>
        Typical flow: <b style={{ color: T.dim }}>Discover → Compare alternatives → Analyze → save to Watchlist or use in a recommendation.</b>
      </div>
    </div>
  );
}

// Recent saved client profiles (existing localStorage data, not new functionality).
function RecentClients({ go }: { go: (d: HubDest) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  useEffect(() => { setClients(loadClients()); }, []);
  if (!clients.length) {
    return <EmptyState text="Saved client profiles will appear here. Build a recommendation to create your first one." />;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
      {clients.slice(0, 6).map((c) => (
        <button key={c.id} onClick={() => go("portfolios")} style={{ textAlign: "left", cursor: "pointer",
          background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 14px",
          display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: T.panel3, border: `1px solid ${T.line2}`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: T.dim, ...ui }}>
            {(c.name || "?").trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: T.text, ...ui, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name || "Untitled client"}</span>
            <span style={{ display: "block", fontSize: 11.5, color: T.muted, ...ui }}>{riskLabel(c.risk)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Advisor Workspace - a client and recommendation command center ──
export function AdvisorWorkspaceTab({ go }: { go: (d: HubDest) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26, maxWidth: 1080 }}>
      <PageHeader title="Advisor Workspace"
        subtitle="Your client and recommendation command center - build portfolios, review holdings, and present with confidence." />

      <div style={section}>
        <SecLabel>Quick actions</SecLabel>
        <QuickActions go={go} items={[["Build Recommendation", "build"], ["Portfolio Review", "improve"], ["Client Portfolios", "portfolios"], ["Present to Client", "present"]]} />
      </div>

      <div style={section}>
        <SecLabel>Client activity</SecLabel>
        <RecentClients go={go} />
      </div>

      <div style={{ ...section, gap: 14 }}>
        <SecLabel>Your workstation</SecLabel>
        <div style={panelGrid}>
          <Panel iconKey="build" title="Recent Recommendations"
            empty="Recommendations you generate will be listed here so you can reopen or re-present them." />
          <Panel iconKey="portfolios" title="Draft Portfolios"
            empty="In-progress portfolios you haven't finalized will be saved here to pick back up." />
          <Panel iconKey="opportunity" title="Opportunity Feed"
            empty="Client portfolios that need attention - high expenses, risk drift, or replacement candidates - will surface here." />
        </div>
      </div>

      <div style={{ fontSize: 12, color: T.muted, ...ui }}>
        Typical flow: <b style={{ color: T.dim }}>Build Recommendation → Present to Client → monitor and improve later.</b>
      </div>
    </div>
  );
}
