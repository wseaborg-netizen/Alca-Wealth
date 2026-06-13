/**
 * Per-ticker news — pulls recent articles mentioning a fund/ticker from the
 * Yahoo Finance search API. Cached 30 minutes per ticker.
 */
import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";

const CACHE_TTL = 30 * 60;

export interface TickerNewsItem {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: number; // unix seconds
  image: string;
}

async function fetchTickerNews(ticker: string): Promise<TickerNewsItem[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=8&quotesCount=0&enableFuzzyQuery=false`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      news?: Array<{
        uuid?: string; title?: string; publisher?: string; link?: string;
        providerPublishTime?: number;
        thumbnail?: { resolutions?: Array<{ url?: string; width?: number }> };
      }>;
    };
    return (data.news ?? [])
      .map((n) => {
        const thumbs = n.thumbnail?.resolutions ?? [];
        const img = thumbs.sort((a, b) => (a.width ?? 0) - (b.width ?? 0))[0]?.url ?? "";
        return {
          uuid: n.uuid ?? n.link ?? "",
          title: n.title ?? "",
          publisher: n.publisher ?? "Yahoo Finance",
          link: n.link ?? "#",
          publishedAt: n.providerPublishTime ?? 0,
          image: img,
        };
      })
      .filter((n) => n.title)
      .slice(0, 6);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toUpperCase();
  if (!q) return NextResponse.json({ items: [] });

  const key = `news:ticker:${q}`;
  const cached = await cacheGet<{ items: TickerNewsItem[]; fetchedAt: number }>(key);
  if (cached) return NextResponse.json(cached);

  const items = await fetchTickerNews(q);
  const payload = { items, fetchedAt: Date.now() };
  if (items.length > 0) await cacheSet(key, payload, CACHE_TTL);
  return NextResponse.json(payload);
}
