SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "cleared_text_hash" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "withdrawn_at" timestamp with time zone;