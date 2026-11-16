SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "topic_memories_written_at" timestamp with time zone;
