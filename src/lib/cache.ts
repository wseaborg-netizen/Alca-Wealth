/**
 * Cache layer - uses Upstash Redis in production (Vercel) and an in-memory
 * Map locally so local dev still works without any extra setup.
 *
 * All functions are async to support both backends uniformly.
 * Server-side only - never imported in client components.
 */

// ── In-memory fallback (local dev) ──────────────────────────────────────────
// Honors a per-key TTL (mirrors Redis `ex`) so short-lived data (market: 15m)
// and long-lived data (profiles/history: 24h) expire correctly in dev, not on
// a single blanket window.
interface MemEntry { value: string; expiresAt: number }
const MEM: Map<string, MemEntry> = new Map();
const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24h

function memGet<T>(key: string): T | null {
  const entry = MEM.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { MEM.delete(key); return null; }
  try { return JSON.parse(entry.value) as T; } catch { return null; }
}

function memSet(key: string, value: unknown, ttlSeconds = DEFAULT_TTL_SECONDS): void {
  MEM.set(key, { value: JSON.stringify(value), expiresAt: Date.now() + ttlSeconds * 1000 });
}

// ── Upstash Redis (production) ───────────────────────────────────────────────
// Lazily initialised so the module can still load if vars are absent.
let _redis: import("@upstash/redis").Redis | null = null;

function getRedis(): import("@upstash/redis").Redis | null {
  if (_redis) return _redis;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  // Dynamic require so the import doesn't crash when package is absent.
  try {
    const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
    _redis = new Redis({ url, token });
    return _redis;
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────
const TTL_SECONDS = 24 * 60 * 60; // 24h

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return memGet<T>(key);
  try {
    const val = await redis.get<T>(key);
    return val ?? null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = TTL_SECONDS): Promise<void> {
  // Strip internal helpers like _ttlOverride before storing (applies to both backends).
  if (typeof value === "object" && value !== null && "_ttlOverride" in value) {
    const { _ttlOverride, ...rest } = value as Record<string, unknown>;
    ttlSeconds = Math.floor((_ttlOverride as number) / 1000) || TTL_SECONDS;
    value = rest;
  }
  const redis = getRedis();
  if (!redis) { memSet(key, value, ttlSeconds); return; }
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch {
    memSet(key, value, ttlSeconds);
  }
}

// ── Request coalescing ───────────────────────────────────────────────────────
// Deduplicates concurrent identical fetches within one server instance: if two
// components request the same ticker before the first resolves, they share one
// in-flight promise instead of both hitting the provider. Complements the cache
// (which dedups across time; this dedups across concurrency).
const inflight = new Map<string, Promise<unknown>>();

export function coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function cacheDelete(key: string): Promise<void> {
  MEM.delete(key);
  const redis = getRedis();
  if (redis) { try { await redis.del(key); } catch { /* ignore */ } }
}

export async function cacheClear(): Promise<void> {
  MEM.clear();
  const redis = getRedis();
  if (redis) {
    try {
      // FLUSHDB would wipe everything — instead scan only ALCA's active namespaces
      // (the Tiingo-backed fund/benchmark/quote caches + the dashboard payload).
      const groups = await Promise.all([
        redis.keys("td:*"),
        redis.keys("market:*"),
        redis.keys("ovq:*"),
      ]);
      const all = groups.flat();
      if (all.length) await redis.del(...all as [string, ...string[]]);
    } catch { /* ignore */ }
  }
}
