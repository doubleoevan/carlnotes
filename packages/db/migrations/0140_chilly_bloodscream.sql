SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "ingest_source_results" jsonb;
