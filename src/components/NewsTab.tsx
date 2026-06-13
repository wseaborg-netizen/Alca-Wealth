"use client";
import React, { useEffect, useMemo, useState } from "react";
import { T, ui, mono } from "./tokens";
import { Label } from "./ui";

interface NewsItem {
  uuid: string;
  title: string;
  summary: string;
  publisher: string;
  link: string;
  publishedAt: number;
  tickers: string[];
  image: string;
}

function Thumb({ src, height }: { src: string; height: number }) {
  if (!src) return null;
  return (
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer"
      style={{ width: "100%", height, objectFit: "cover", borderRadius: 8,
        marginBottom: 12, background: T.panel2 }}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
  );
}

function timeAgo(ts: number): string {
  if (!ts) return "";
  const mins = Math.floor((Date.now() / 1000 - ts) / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

const open = (link: string) => window.open(link, "_blank", "noopener,noreferrer");

function Tickers({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <>
      {items.slice(0, 4).map((t) => (
        <span key={t} style={{ fontSize: 9, ...mono, fontWeight: 600, color: T.data,
          background: T.dataL, padding: "1px 6px", borderRadius: 3 }}>{t}</span>
      ))}
    </>
  );
}

function Meta({ item }: { item: NewsItem }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 10, color: T.muted, ...ui }}>{item.publisher}</span>
      {item.publishedAt > 0 && <>
        <span style={{ fontSize: 10, color: T.muted }}>·</span>
        <span style={{ fontSize: 10, color: T.muted, ...mono }}>{timeAgo(item.publishedAt)}</span>
      </>}
      <Tickers items={item.tickers} />
    </div>
  );
}

function FeatureCard({ item }: { item: NewsItem }) {
  return (
    <div onClick={() => open(item.link)}
      style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10,
        padding: "22px 24px", cursor: "pointer", transition: "all 0.12s",
        gridColumn: "1 / -1" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.blue; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; }}
    >
      <Thumb src={item.image} height={230} />
      <div style={{ fontSize: 9, fontWeight: 600, color: T.blue, textTransform: "uppercase",
        letterSpacing: "0.12em", ...ui, marginBottom: 8 }}>Top Story</div>
      <div style={{ fontSize: 19, fontWeight: 600, color: T.text, lineHeight: 1.35, ...ui, marginBottom: 10 }}>
        {item.title}
      </div>
      {item.summary && (
        <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.65, ...ui, marginBottom: 12, maxWidth: 760 }}>
          {item.summary}
        </div>
      )}
      <Meta item={item} />
    </div>
  );
}

function StoryCard({ item }: { item: NewsItem }) {
  return (
    <div onClick={() => open(item.link)}
      style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10,
        padding: "18px 20px", cursor: "pointer", transition: "all 0.12s",
        display: "flex", flexDirection: "column", gap: 8 }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.blue; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; }}
    >
      <Thumb src={item.image} height={150} />
      <div style={{ fontSize: 14, fontWeight: 600, color: T.text, lineHeight: 1.45, ...ui }}>
        {item.title}
      </div>
      {item.summary && (
        <div style={{ fontSize: 11.5, color: T.dim, lineHeight: 1.6, ...ui,
          display: "-webkit-box", WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"],
          overflow: "hidden", flex: 1 }}>
          {item.summary}
        </div>
      )}
      <Meta item={item} />
    </div>
  );
}

export default function NewsTab() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/news")
      .then((r) => r.json())
      .then((d) => { setNews(d.items ?? []); setFetchedAt(d.fetchedAt ?? null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return news;
    return news.filter((n) =>
      n.title.toLowerCase().includes(term) ||
      n.summary.toLowerCase().includes(term) ||
      n.tickers.some((t) => t.toLowerCase().includes(term)));
  }, [news, q]);

  const feature = filtered[0] ?? null;
  const rest = filtered.slice(1);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18, gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: T.text, margin: 0, ...ui }}>Market News</h2>
          <p style={{ fontSize: 12, color: T.dim, marginTop: 4, ...ui }}>
            Live headlines on markets, funds, and the macro backdrop.
            {fetchedAt && <span style={{ color: T.muted }}> &nbsp;·&nbsp; updated {new Date(fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          </p>
        </div>
        <div style={{ width: 280, flexShrink: 0 }}>
          <Label>Filter headlines</Label>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search news or ticker…"
            style={{ width: "100%", background: T.panel, color: T.text, border: `1px solid ${T.line2}`,
              borderRadius: 6, outline: "none", padding: "7px 12px", fontSize: 13,
              boxSizing: "border-box", ...ui }} />
        </div>
      </div>

      {loading && (
        <div style={{ padding: "64px 0", textAlign: "center", color: T.dim, fontSize: 13, ...ui }}>
          Loading headlines…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10,
          padding: "48px 24px", textAlign: "center", color: T.muted, fontSize: 13, ...ui }}>
          {q ? `No headlines match “${q}”.` : "No news available right now."}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {feature && <FeatureCard item={feature} />}
          {rest.map((item) => <StoryCard key={item.uuid} item={item} />)}
        </div>
      )}

      <p style={{ fontSize: 10, color: T.muted, ...ui, textAlign: "center", marginTop: 18 }}>
        Headlines via Yahoo Finance · Refreshed periodically · Not investment advice
      </p>
    </div>
  );
}
