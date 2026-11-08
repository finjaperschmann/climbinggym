import type { Config } from "@netlify/functions";
import { and, asc, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { chatMessages, players } from "../../db/schema.js";

// A player is considered online if they sent a heartbeat within this window.
const ONLINE_MS = 8_000;
const MAX_STATE_BYTES = 2_048;

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) : "";

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = clean(body?.id, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return Response.json({ error: "Invalid id" }, { status: 400 });

  if (body.leave) {
    await db.delete(players).where(eq(players.id, id));
    return Response.json({ ok: true });
  }

  const name = clean(body.name, 12) || "Gast";
  const state = body.state && typeof body.state === "object" ? body.state : {};
  if (JSON.stringify(state).length > MAX_STATE_BYTES) {
    return Response.json({ error: "State too large" }, { status: 413 });
  }

  const now = new Date();
  await db
    .insert(players)
    .values({ id, name, state, updatedAt: now })
    .onConflictDoUpdate({ target: players.id, set: { name, state, updatedAt: now } });

  const chatText = clean(body.chat, 140);
  if (chatText) await db.insert(chatMessages).values({ playerId: id, name, text: chatText });

  const cutoff = new Date(now.getTime() - ONLINE_MS);
  const others = await db
    .select({ id: players.id, name: players.name, state: players.state })
    .from(players)
    .where(and(ne(players.id, id), gt(players.updatedAt, cutoff)))
    .limit(50);

  const since = Number.isInteger(body.since) && body.since > 0 ? body.since : 0;
  const recent = new Date(now.getTime() - 10 * 60_000);
  const chat = since
    ? await db
        .select()
        .from(chatMessages)
        .where(gt(chatMessages.id, since))
        .orderBy(asc(chatMessages.id))
        .limit(30)
    : (
        await db
          .select()
          .from(chatMessages)
          .where(gt(chatMessages.createdAt, recent))
          .orderBy(desc(chatMessages.id))
          .limit(8)
      ).reverse();

  // Occasional housekeeping so the tables stay small.
  if (Math.random() < 0.02) {
    await db.delete(players).where(lt(players.updatedAt, new Date(now.getTime() - 60 * 60_000)));
    await db.delete(chatMessages).where(lt(chatMessages.createdAt, sql`now() - interval '1 day'`));
  }

  let cursor = chat.length ? chat[chat.length - 1].id : since;
  if (!cursor) {
    const [row] = await db.select({ max: sql<number>`coalesce(max(${chatMessages.id}), 0)` }).from(chatMessages);
    cursor = Number(row?.max) || 0;
  }

  return Response.json({
    players: others,
    cursor,
    chat: chat.map((m) => ({ id: m.id, pid: m.playerId, name: m.name, text: m.text })),
  });
};

export const config: Config = { path: "/api/presence" };
