"use client";
/**
 * Save to List — the one reusable control for saving a fund into the
 * advisor's saved fund lists (Commonly Used Funds, Watchlist, custom lists).
 * Auth-aware: signed-out users see a sign-in prompt instead of a fake save.
 * Lists are cached module-wide so many buttons on one page share one fetch.
 */
import React, { useEffect, useRef, useState } from "react";
import { T, ui } from "./tokens";

export interface FundListLite {
  id: string; name: string; type: "common" | "watchlist" | "custom";
  items: { ticker: string }[];
}

// Module-level cache shared by every SaveToList on the page.
let cache: FundListLite[] | null | undefined; // undefined=unfetched, null=signed out
let inflight: Promise<FundListLite[] | null> | null = null;
const listeners = new Set<() => void>();

async function fetchLists(force = false): Promise<FundListLite[] | null> {
  if (!force && cache !== undefined) return cache;
  if (!inflight) {
    inflight = fetch("/api/lists").then(async (r) => {
      if (r.status === 401) return null;
      const d = await r.json();
      return (d.lists ?? []) as FundListLite[];
    }).catch(() => null).then((v) => {
      cache = v; inflight = null;
      listeners.forEach((fn) => fn());
      return v;
    });
  }
  return inflight;
}

async function mutate(body: Record<string, unknown>): Promise<boolean> {
  const r = await fetch("/api/lists", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).catch(() => null);
  if (!r?.ok) return false;
  await fetchLists(true); // refresh the shared cache
  return true;
}

export function SaveToList({ ticker, fundName, category, compact }: {
  ticker: string; fundName?: string | null; category?: string | null;
  /** compact = small "+" icon button for table rows */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<FundListLite[] | null | undefined>(cache);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState("");
  const [newName, setNewName] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setLists(cache);
    listeners.add(sync);
    return () => { listeners.delete(sync); };
  }, []);

  useEffect(() => {
    if (!open) return;
    void fetchLists().then(setLists);
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const t = ticker.toUpperCase();
  const savedIn = (lists ?? []).filter((l) => l.items.some((i) => i.ticker === t));
  const savedAnywhere = savedIn.length > 0;

  const add = async (listId: string) => {
    setBusy(listId);
    const ok = await mutate({ action: "addItem", listId, ticker: t, fundName, category });
    setBusy(null);
    setFlash(ok ? "Saved" : "Save failed");
    setTimeout(() => setFlash(""), 1800);
  };
  const remove = async (listId: string) => {
    setBusy(listId);
    await mutate({ action: "removeItem", listId, ticker: t });
    setBusy(null);
  };
  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy("new");
    const r = await fetch("/api/lists", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createList", name }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.id) { await mutate({ action: "addItem", listId: r.id, ticker: t, fundName, category }); setNewName(""); setFlash("Saved"); setTimeout(() => setFlash(""), 1800); }
    else await fetchLists(true).then(setLists);
    setBusy(null);
  };

  return (
    <div ref={boxRef} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        title={savedAnywhere ? `Saved in: ${savedIn.map((l) => l.name).join(", ")}` : "Save to List"}
        style={compact
          ? { width: 24, height: 24, borderRadius: 6, border: `1px solid ${savedAnywhere ? `${T.blue}66` : T.line2}`,
              background: savedAnywhere ? T.blueL : T.panel, color: savedAnywhere ? T.blue : T.dim,
              cursor: "pointer", fontSize: 13, lineHeight: 1, ...ui }
          : { padding: "7px 12px", borderRadius: 8, border: `1px solid ${savedAnywhere ? `${T.blue}66` : T.line2}`,
              background: savedAnywhere ? T.blueL : T.panel, color: savedAnywhere ? T.blue : T.dim,
              cursor: "pointer", fontSize: 12, fontWeight: 600, ...ui }}>
        {compact ? (savedAnywhere ? "✓" : "+") : (flash || (savedAnywhere ? "Saved ✓" : "Save to List"))}
      </button>

      {open && (
        <div role="menu" style={{ position: "absolute", top: "calc(100% + 5px)", right: 0, zIndex: 60, minWidth: 230,
          background: T.panel, border: `1px solid ${T.line2}`, borderRadius: 10, boxShadow: "var(--elev-3)",
          padding: 6 }}>
          {lists === undefined && (
            <div style={{ padding: "9px 11px", fontSize: 12, color: T.muted, ...ui }}>Loading lists…</div>
          )}
          {lists === null && (
            <div style={{ padding: "10px 11px", fontSize: 12, color: T.dim, ...ui, lineHeight: 1.5 }}>
              Sign in to save funds to your lists.
              <a href="/login" style={{ display: "block", marginTop: 6, color: T.blue, fontWeight: 600, textDecoration: "none" }}>Sign in →</a>
            </div>
          )}
          {lists && lists.map((l) => {
            const saved = l.items.some((i) => i.ticker === t);
            return (
              <button key={l.id} role="menuitem" disabled={busy === l.id}
                onClick={() => saved ? remove(l.id) : add(l.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px",
                  border: "none", borderRadius: 7, background: "transparent", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.blueL)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <span style={{ width: 14, color: saved ? T.green : T.muted, fontSize: 12 }}>{saved ? "✓" : "＋"}</span>
                <span style={{ flex: 1, fontSize: 12.5, color: T.text, ...ui }}>{l.name}</span>
                <span style={{ fontSize: 10, color: T.muted, ...ui }}>{l.items.length}</span>
              </button>
            );
          })}
          {lists && (
            <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 4, paddingTop: 6, display: "flex", gap: 6, padding: "6px 6px 2px" }}>
              <input value={newName} placeholder="New list name" onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
                style={{ flex: 1, minWidth: 0, padding: "6px 9px", borderRadius: 7, border: `1px solid ${T.line2}`,
                  background: T.panel, color: T.text, fontSize: 12, ...ui, outline: "none" }} />
              <button onClick={createAndAdd} disabled={!newName.trim() || busy === "new"}
                style={{ padding: "6px 10px", borderRadius: 7, border: "none", cursor: "pointer",
                  background: T.blue, color: "#fff", fontSize: 11.5, fontWeight: 600, ...ui }}>Create</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
