import { NextRequest, NextResponse } from "next/server";
import {
  requireFirmContext, listsGetAll, listCreate, listRename, listDelete,
  listItemAdd, listItemRemove, listItemNote,
} from "@/lib/db";

/** Saved fund lists — firm-scoped, RLS-enforced. Defaults (Commonly Used
    Funds + Watchlist) are provisioned on first read; custom lists CRUD here.
    Future SEC/news alert monitoring reads these same lists. */

export async function GET() {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ lists: null }, { status: 401 });
  try {
    return NextResponse.json({ lists: await listsGetAll(ctx.sb, ctx.firm.id, ctx.user.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action as string | undefined;
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    switch (action) {
      case "createList": {
        const name = String(body?.name ?? "").trim();
        if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
        const id = await listCreate(ctx.sb, ctx.firm.id, ctx.user.id, name);
        return NextResponse.json({ ok: true, id });
      }
      case "renameList": {
        const { id, name } = body as { id?: string; name?: string };
        if (!id || !name?.trim()) return NextResponse.json({ error: "id and name required" }, { status: 400 });
        await listRename(ctx.sb, ctx.firm.id, id, name);
        return NextResponse.json({ ok: true });
      }
      case "deleteList": {
        const { id } = body as { id?: string };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        await listDelete(ctx.sb, ctx.firm.id, id);
        return NextResponse.json({ ok: true });
      }
      case "addItem": {
        const { listId, ticker, fundName, category, note } = body as {
          listId?: string; ticker?: string; fundName?: string; category?: string; note?: string;
        };
        if (!listId || !ticker?.trim()) return NextResponse.json({ error: "listId and ticker required" }, { status: 400 });
        await listItemAdd(ctx.sb, ctx.firm.id, ctx.user.id, listId,
          { ticker, fundName: fundName ?? null, category: category ?? null, note: note ?? null });
        return NextResponse.json({ ok: true });
      }
      case "removeItem": {
        const { listId, ticker } = body as { listId?: string; ticker?: string };
        if (!listId || !ticker) return NextResponse.json({ error: "listId and ticker required" }, { status: 400 });
        await listItemRemove(ctx.sb, listId, ticker);
        return NextResponse.json({ ok: true });
      }
      case "setNote": {
        const { listId, ticker, note } = body as { listId?: string; ticker?: string; note?: string | null };
        if (!listId || !ticker) return NextResponse.json({ error: "listId and ticker required" }, { status: 400 });
        await listItemNote(ctx.sb, listId, ticker, note ?? null);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
