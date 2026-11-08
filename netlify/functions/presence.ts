import type { Config } from "@netlify/functions";
import { and, asc, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import { handlePresence } from "../../lib/presence.mjs";
import { db } from "../../db/index.js";
import { chatMessages, players } from "../../db/schema.js";

const HOUR_MS = 60 * 60_000;

function mapChat(m: { id: number; playerId: string; name: string; text: string }) {
  return { id: m.id, playerId: m.playerId, name: m.name, text: m.text };
}

const store = {
  async deletePlayer(id: string) {
    await db.delete(players).where(eq(players.id, id));
  },
  async upsertPlayer(row: { id: string; name: string; state: object; updatedAt: Date }) {
    await db
      .insert(players)
      .values(row)
      .onConflictDoUpdate({
        target: players.id,
        set: { name: row.name, state: row.state, updatedAt: row.updatedAt },
      });
  },
  async insertChat(row: { playerId: string; name: string; text: string }) {
    await db.insert(chatMessages).values(row);
  },
  async listOnline(excludeId: string, cutoff: Date) {
    return db
      .select({ id: players.id, name: players.name, state: players.state })
      .from(players)
      .where(and(ne(players.id, excludeId), gt(players.updatedAt, cutoff)))
      .limit(50);
  },
  async chatSince(since: number) {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(gt(chatMessages.id, since))
      .orderBy(asc(chatMessages.id))
      .limit(30);
    return rows.map(mapChat);
  },
  async chatRecent(cutoff: Date) {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(gt(chatMessages.createdAt, cutoff))
      .orderBy(desc(chatMessages.id))
      .limit(8);
    return rows.reverse().map(mapChat);
  },
  async cleanup(now: Date) {
    await db.delete(players).where(lt(players.updatedAt, new Date(now.getTime() - HOUR_MS)));
    await db.delete(chatMessages).where(lt(chatMessages.createdAt, sql`now() - interval '1 day'`));
  },
  async maxChatId() {
    const [row] = await db
      .select({ max: sql<number>`coalesce(max(${chatMessages.id}), 0)` })
      .from(chatMessages);
    return Number(row?.max) || 0;
  },
};

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await handlePresence(body, store);
  return Response.json(result.json, { status: result.status });
};

export const config: Config = { path: "/api/presence" };
