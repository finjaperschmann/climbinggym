import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

export function openDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, "gym.sqlite"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS players_updated_at_idx ON players (updated_at);
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON chat_messages (created_at);
  `);
  return db;
}

function parseState(raw) {
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === "object") return value;
  } catch {
    // A damaged row should not take the hall down.
  }
  return {};
}

function mapChat(row) {
  return {
    id: Number(row.id),
    playerId: row.player_id,
    name: row.name,
    text: row.text,
  };
}

export function createStore(db) {
  const deletePlayerStmt = db.prepare("DELETE FROM players WHERE id = ?");
  const upsertPlayerStmt = db.prepare(`
    INSERT INTO players (id, name, state, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      state = excluded.state,
      updated_at = excluded.updated_at
  `);
  const insertChatStmt = db.prepare(
    "INSERT INTO chat_messages (player_id, name, text, created_at) VALUES (?, ?, ?, ?)",
  );
  const listOnlineStmt = db.prepare(`
    SELECT id, name, state FROM players
    WHERE id != ? AND updated_at > ?
    LIMIT 50
  `);
  const chatSinceStmt = db.prepare(`
    SELECT id, player_id, name, text FROM chat_messages
    WHERE id > ?
    ORDER BY id ASC
    LIMIT 30
  `);
  const chatRecentStmt = db.prepare(`
    SELECT id, player_id, name, text FROM chat_messages
    WHERE created_at > ?
    ORDER BY id DESC
    LIMIT 8
  `);
  const deleteStalePlayersStmt = db.prepare("DELETE FROM players WHERE updated_at < ?");
  const deleteStaleChatStmt = db.prepare("DELETE FROM chat_messages WHERE created_at < ?");
  const maxChatIdStmt = db.prepare("SELECT coalesce(max(id), 0) AS max FROM chat_messages");

  return {
    async deletePlayer(id) {
      deletePlayerStmt.run(id);
    },
    async upsertPlayer(row) {
      upsertPlayerStmt.run(row.id, row.name, JSON.stringify(row.state ?? {}), row.updatedAt.getTime());
    },
    async insertChat(row) {
      const at = row.createdAt instanceof Date ? row.createdAt.getTime() : Date.now();
      insertChatStmt.run(row.playerId, row.name, row.text, at);
    },
    async listOnline(excludeId, cutoff) {
      return listOnlineStmt.all(excludeId, cutoff.getTime()).map((row) => ({
        id: row.id,
        name: row.name,
        state: parseState(row.state),
      }));
    },
    async chatSince(since) {
      return chatSinceStmt.all(since).map(mapChat);
    },
    async chatRecent(cutoff) {
      return chatRecentStmt.all(cutoff.getTime()).map(mapChat).reverse();
    },
    async cleanup(now) {
      const at = now.getTime();
      deleteStalePlayersStmt.run(at - HOUR_MS);
      deleteStaleChatStmt.run(at - DAY_MS);
    },
    async maxChatId() {
      return Number(maxChatIdStmt.get().max) || 0;
    },
  };
}
