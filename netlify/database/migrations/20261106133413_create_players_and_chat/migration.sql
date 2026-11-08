CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY,
	"player_id" text NOT NULL,
	"name" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY,
	"name" text DEFAULT '' NOT NULL,
	"state" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages" ("created_at");--> statement-breakpoint
CREATE INDEX "players_updated_at_idx" ON "players" ("updated_at");