/**
 * Financial news - parses Yahoo Finance RSS feed for titles + summaries.
 * Provider: Yahoo (intentional). FMP's news is per-symbol, not a broad-market
 * feed, so Yahoo remains the better source for this general dashboard headline
 * strip. Cached 30 minutes.
 */
import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";

const CACHE_TTL = 30 * 60;

export interface NewsItem {
  uuid: string;
  title: string;
  summary: string;
  publisher: string;
  link: string;
  publishedAt: number; // unix seconds
  tickers: string[];
  image: string;       // thumbnail URL (may be empty)
}

function stripHTML(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCDATA(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseRSS(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/gi) ?? [];

  for (const block of blocks) {
    const title = stripHTML(extractCDATA(block, "title") || extractTag(block, "title"));
    const link = extractTag(block, "link") || extractCDATA(block, "link");
    const pubDateStr = extractTag(block, "pubDate");
    const description = stripHTML(
      extractCDATA(block, "description") || extractTag(block, "description")
    );
    const source = extractCDATA(block, "source") || extractTag(block, "source") || "Yahoo Finance";

    if (!title || !link) continue;

    const image = (block.match(/<media:content[^>]*url="([^"]+)"/i)
      ?? block.match(/<media:thumbnail[^>]*url="([^"]+)"/i)
      ?? block.match(/<enclosure[^>]*url="([^"]+)"/i) ?? [])[1] ?? "";

    const publishedAt = pubDateStr ? Math.floor(new Date(pubDateStr).getTime() / 1000) : 0;

    // Trim summary to ~160 chars cleanly
    let summary = description;
    if (summary.length > 160) {
      summary = summary.slice(0, 157) + "…";
    }

    items.push({
      uuid: link,
      title,
      summary,
      publisher: source,
      link,
      publishedAt,
      tickers: [],
      image,
    });

    if (items.length >= 20) break;
  }

  return items;
}

async function fetchNewsRSS(): Promise<NewsItem[]> {
  // Yahoo Finance markets RSS - includes article summaries
  const feeds = [
    "https://finance.yahoo.com/news/rssindex",
    "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US",
  ];

  for (const url of feeds) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/rss+xml, application/xml, text/xml" },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      const items = parseRSS(text);
      if (items.length > 0) return items;
    } catch { /* try next feed */ }
  }

  // Fallback: Yahoo Finance search API (no summaries but better than nothing)
  try {
    const url = "https://query1.finance.yahoo.com/v1/finance/search?q=stock+market+investing&newsCount=8&enableFuzzyQuery=false&enableCb=false";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json() as {
        news?: Array<{ uuid?: string; title?: string; publisher?: string; link?: string; providerPublishTime?: number; relatedTickers?: string[] }>;
      };
      return (data.news ?? []).map(n => ({
        uuid: n.uuid ?? n.link ?? "",
        title: n.title ?? "",
        summary: "",
        publisher: n.publisher ?? "Yahoo Finance",
        link: n.link ?? "#",
        publishedAt: n.providerPublishTime ?? 0,
        tickers: n.relatedTickers?.slice(0, 4) ?? [],
        image: "",
      })).filter(n => n.title).slice(0, 20);
    }
  } catch { /* no news */ }

  return [];
}

export async function GET() {
  const key = "news:dashboard:v3";
  const cached = await cacheGet<{ items: NewsItem[]; fetchedAt: number }>(key);
  if (cached) return NextResponse.json(cached);

  const items = await fetchNewsRSS();
  const payload = { items, fetchedAt: Date.now() };
  if (items.length > 0) await cacheSet(key, payload, CACHE_TTL);
  return NextResponse.json(payload);
}
