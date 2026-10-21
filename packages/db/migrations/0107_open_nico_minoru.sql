ALTER TABLE "room_messages" ADD COLUMN "is_spoken" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD COLUMN "is_spoken" boolean DEFAULT false NOT NULL;