"use client";
/**
 * Canonical CLIENT-side merged fund universe.
 *
 * The static generated universe (`UNIVERSE`) is bundled, so it renders
 * instantly with zero flash. This hook overlays the VERIFIED dynamic funds
 * (added via Expansion) fetched from `/api/universe` — the same server-side
 * merged loader (src/lib/universeServer.ts) every workspace API uses. One
 * fetch per session is shared across all consumers (module cache), revalidated
 * when stale or after a fund is added, so newly verified funds propagate to
 * Screen Funds, search, model, and portfolio pickers without a redeploy or a
 * hard refresh.
 */
import { useEffect, useState } from "react";
import { UNIVERSE, type UniverseFund } from "./universe";

let cache: UniverseFund[] = UNIVERSE;   // starts static, upgrades to merged
let loaded = false;
let lastFetch = 0;
let inflight: Promise<void> | null = null;
const STALE_MS = 30_000;
const subs = new Set<() => void>();

function notify() { subs.forEach((f) => f()); }

function fetchMerged(): Promise<void> {
  if (inflight) return inflight;
  inflight = fetch("/api/universe", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (Array.isArray(d) && d.length) {
        // Dedup defensively by ticker; the server already prefers static records.
        const seen = new Set<string>();
        cache = (d as UniverseFund[]).filter((f) => {
          const t = f.ticker?.toUpperCase();
          if (!t || seen.has(t)) return false;
          seen.add(t); return true;
        });
        loaded = true; lastFetch = Date.now(); notify();
      }
    })
    .catch(() => { /* keep static cache — never throws to the UI */ })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Force a re-fetch on next use (call after adding a verified fund). */
export function refreshMergedUniverse(): Promise<void> {
  loaded = false; lastFetch = 0;
  return fetchMerged();
}

/** Latest known merged funds without subscribing (safe anywhere). */
export function mergedUniverseNow(): UniverseFund[] { return cache; }

/**
 * Merged fund universe for client components. `funds` starts as the static
 * universe and swaps to the merged set once loaded; `count` is always live.
 */
export function useMergedUniverse(): { funds: UniverseFund[]; count: number; loaded: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    subs.add(cb);
    if (!loaded || Date.now() - lastFetch > STALE_MS) void fetchMerged();
    return () => { subs.delete(cb); };
  }, []);
  return { funds: cache, count: cache.length, loaded };
}
