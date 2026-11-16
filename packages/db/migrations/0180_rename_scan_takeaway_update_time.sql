SET LOCAL lock_timeout = '3s';
--> statement-breakpoint
ALTER TABLE "scans" RENAME COLUMN "topic_memories_consolidated_at" TO "topic_memories_updated_at";
