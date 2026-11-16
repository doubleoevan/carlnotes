SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "topic_memories_format_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_memories" ADD COLUMN "fact_date" date;--> statement-breakpoint
ALTER TABLE "topic_memories" ADD COLUMN "is_atomic" boolean DEFAULT false NOT NULL;