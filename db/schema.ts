import { pgTable, serial, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

// One row per connected player; refreshed by heartbeats while they play.
export const players = pgTable(
  "players",
  {
    id: text().primaryKey(),
    name: text().notNull().default(""),
    state: jsonb().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("players_updated_at_idx").on(t.updatedAt)],
);

// Short-lived hall chat.
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial().primaryKey(),
    playerId: text("player_id").notNull(),
    name: text().notNull(),
    text: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_created_at_idx").on(t.createdAt)],
);
