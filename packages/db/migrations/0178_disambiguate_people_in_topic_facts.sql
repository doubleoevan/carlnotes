SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "topic_memories" ADD COLUMN "person" jsonb;--> statement-breakpoint
ALTER TABLE "topic_memories" ADD COLUMN "person_key" text;