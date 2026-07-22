"use client";
/**
 * Saved Lists — Commonly Used Funds, Watchlist, and custom fund lists.
 * Firm-scoped persistence via /api/lists (Supabase + RLS). Future SEC/news
 * alert monitoring will read these same lists.
 */
import React, { useEffect, useState } from "react";
import { T, ui, mono } from "./tokens";
import { Btn, Label, Card, Spinner } from "./ui";

interface Item { ticker: string; fund_name: string | null; category: string | null; note: string | null; added_at: string }
interface List { id: string; name: string; type: "common" | "watchlist" | "custom"; updated_at: string; items: Item[] }

const TYPE_HINT: Record<List["type"], string> = {
  common: "Funds you use frequently and want quick access to.",
  watchlist: "Funds to monitor and research later.",
  custom: "Custom list.",
};

export default function ListsTab({ onAnalyze, onAddToCompare }: {
  onAnalyze?: (t: string) => void; onAddToCompare?: (t: string) => void;
}) {
  const [lists, setLists] = useState<List[] | null | undefined>(undefined);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [noteEdit, setNoteEdit] = useState<{ listId: string; ticker: string; value: string } | null>(null);

  const load = () => fetch("/api/lists").then(async (r) => {
    if (r.status === 401) { setLists(null); return; }
    const d = await r.json();
    setLists((d.lists ?? []) as List[]);
  }).catch(() => setLists(null));

  useEffect(() => { void load(); }, []);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    await fetch("/api/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    await load();
    setBusy(false);
  };

  if (lists === undefined) return <div style={{ maxWidth: 1280, margin: "0 auto" }}><Spinner label="Loading saved lists…" /></div>;
  if (lists === null) return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <Card style={{ padding: "26px 28px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, ...ui }}>Sign in to use Saved Lists</div>
        <p style={{ fontSize: 13, color: T.dim, ...ui, margin: "8px 0 0", lineHeight: 1.6 }}>
          Saved fund lists (Commonly Used Funds, Watchlist, and custom lists) are stored on your account.
        </p>
        <a href="/login" style={{ display: "inline-block", marginTop: 14, padding: "10px 18px", borderRadius: 9,
          background: T.blue, color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none", ...ui }}>Sign in</a>
      </Card>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.02em" }}>Saved Lists</h1>
          <p style={{ fontSize: 14, color: T.dim, ...ui, margin: "7px 0 0" }}>
            Commonly used funds, your watchlist, and custom fund lists — saved to your account.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newName} placeholder="New custom list name" onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) { void act({ action: "createList", name: newName.trim() }); setNewName(""); } }}
            style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.line2}`, background: T.panel,
              color: T.text, fontSize: 13, ...ui, outline: "none" }} />
          <Btn small disabled={!newName.trim() || busy}
            onClick={() => { void act({ action: "createList", name: newName.trim() }); setNewName(""); }}>Create List</Btn>
        </div>
      </div>

      {lists.map((l) => (
        <Card key={l.id} style={{ padding: "18px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Label>{l.name}</Label>
            <span style={{ fontSize: 11, color: T.muted, ...ui }}>{l.items.length} fund{l.items.length === 1 ? "" : "s"} · {TYPE_HINT[l.type]}</span>
            {l.type === "custom" && (
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button onClick={() => { const n = window.prompt("Rename list", l.name); if (n?.trim()) void act({ action: "renameList", id: l.id, name: n.trim() }); }}
                  style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${T.line2}`, background: T.panel,
                    color: T.dim, fontSize: 11, fontWeight: 600, cursor: "pointer", ...ui }}>Rename</button>
                <button onClick={() => { if (window.confirm(`Delete the list "${l.name}" and its ${l.items.length} saved funds?`)) void act({ action: "deleteList", id: l.id }); }}
                  style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${T.red}55`, background: T.panel,
                    color: T.red, fontSize: 11, fontWeight: 600, cursor: "pointer", ...ui }}>Delete</button>
              </span>
            )}
          </div>
          {l.items.length === 0 ? (
            <p style={{ fontSize: 12.5, color: T.muted, ...ui, margin: "10px 0 0" }}>
              Empty — use “Save to List” anywhere you research a fund (Analysis, Screener, Similar Funds).
            </p>
          ) : (
            <div style={{ marginTop: 10, overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
                <thead><tr>
                  {["Fund", "Category", "Note", "Added", ""].map((h, i) => (
                    <th key={i} style={{ textAlign: "left", fontSize: 10, color: T.muted, ...ui, padding: "2px 14px 6px 0",
                      fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {l.items.map((it) => (
                    <tr key={it.ticker} style={{ borderTop: `1px solid ${T.line}` }}>
                      <td style={{ padding: "8px 14px 8px 0", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: T.blue, ...mono }}>{it.ticker}</span>
                        {it.fund_name && <span style={{ display: "block", fontSize: 10.5, color: T.muted, ...ui, maxWidth: 220,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.fund_name}</span>}
                      </td>
                      <td style={{ padding: "8px 14px 8px 0", fontSize: 11.5, color: T.dim, ...ui }}>{it.category ?? "—"}</td>
                      <td style={{ padding: "8px 14px 8px 0", fontSize: 11.5, color: T.dim, ...ui, maxWidth: 260 }}>
                        {noteEdit && noteEdit.listId === l.id && noteEdit.ticker === it.ticker ? (
                          <span style={{ display: "flex", gap: 6 }}>
                            <input value={noteEdit.value} autoFocus
                              onChange={(e) => setNoteEdit({ ...noteEdit, value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") { void act({ action: "setNote", listId: l.id, ticker: it.ticker, note: noteEdit.value }); setNoteEdit(null); } if (e.key === "Escape") setNoteEdit(null); }}
                              style={{ flex: 1, padding: "4px 8px", borderRadius: 6, border: `1px solid ${T.line2}`,
                                background: T.panel, color: T.text, fontSize: 11.5, ...ui, outline: "none" }} />
                            <button onClick={() => { void act({ action: "setNote", listId: l.id, ticker: it.ticker, note: noteEdit.value }); setNoteEdit(null); }}
                              style={{ border: "none", background: "none", color: T.blue, cursor: "pointer", fontSize: 11, fontWeight: 600, ...ui }}>Save</button>
                          </span>
                        ) : (
                          <button onClick={() => setNoteEdit({ listId: l.id, ticker: it.ticker, value: it.note ?? "" })}
                            title="Edit note"
                            style={{ border: "none", background: "none", cursor: "pointer", padding: 0, textAlign: "left",
                              fontSize: 11.5, color: it.note ? T.dim : T.muted, ...ui }}>
                            {it.note ?? "+ note"}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: "8px 14px 8px 0", fontSize: 11, color: T.muted, ...ui, whiteSpace: "nowrap" }}>
                        {new Date(it.added_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "8px 0", whiteSpace: "nowrap" }}>
                        <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {onAnalyze && <button onClick={() => onAnalyze(it.ticker)}
                            style={{ padding: "5px 10px", borderRadius: 7, border: "none", background: T.blue, color: "#fff",
                              fontSize: 11, fontWeight: 600, cursor: "pointer", ...ui }}>Analyze</button>}
                          {onAddToCompare && <button onClick={() => onAddToCompare(it.ticker)}
                            style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${T.line2}`, background: T.panel,
                              color: T.dim, fontSize: 11, fontWeight: 600, cursor: "pointer", ...ui }}>Compare</button>}
                          <button onClick={() => void act({ action: "removeItem", listId: l.id, ticker: it.ticker })}
                            style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${T.line2}`, background: T.panel,
                              color: T.muted, fontSize: 11, fontWeight: 600, cursor: "pointer", ...ui }}>Remove</button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}

      <p style={{ fontSize: 11.5, color: T.muted, ...ui, margin: 0, lineHeight: 1.6 }}>
        Future alert monitoring can use these saved lists to surface fund filings, news, holdings changes,
        and SEC updates for the funds you follow.
      </p>
    </div>
  );
}
