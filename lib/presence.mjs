// Shared hall presence rules for the Netlify function and the NAS server.

const ONLINE_MS = 8_000;
const MAX_STATE_BYTES = 2_048;

const clean = (v, max) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) : "";

export async function handlePresence(body, store) {
  if (!body || typeof body !== "object") return { status: 400, json: { error: "Invalid JSON" } };

  const id = clean(body?.id, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return { status: 400, json: { error: "Invalid id" } };

  if (body.leave) {
    await store.deletePlayer(id);
    return { status: 200, json: { ok: true } };
  }

  const name = clean(body.name, 12) || "Gast";
  const state = body.state && typeof body.state === "object" ? body.state : {};
  if (JSON.stringify(state).length > MAX_STATE_BYTES) {
    return { status: 413, json: { error: "State too large" } };
  }

  const now = new Date();
  await store.upsertPlayer({ id, name, state, updatedAt: now });

  const chatText = clean(body.chat, 140);
  if (chatText) await store.insertChat({ playerId: id, name, text: chatText });

  const others = await store.listOnline(id, new Date(now.getTime() - ONLINE_MS));
  const since = Number.isInteger(body.since) && body.since > 0 ? body.since : 0;
  const chat = since
    ? await store.chatSince(since)
    : await store.chatRecent(new Date(now.getTime() - 10 * 60_000));

  if (Math.random() < 0.02) await store.cleanup(now);

  let cursor = chat.length ? chat[chat.length - 1].id : since;
  if (!cursor) cursor = await store.maxChatId();

  return {
    status: 200,
    json: {
      players: others,
      cursor,
      chat: chat.map((m) => ({ id: m.id, pid: m.playerId, name: m.name, text: m.text })),
    },
  };
}
