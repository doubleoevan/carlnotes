SET LOCAL lock_timeout = '3s';--> statement-breakpoint
-- The previous release no longer reads these names. The Journal first ships with this schema.
ALTER TABLE "scans" RENAME COLUMN "topic_memories_consolidated_at" TO "topic_memories_updated_at";
