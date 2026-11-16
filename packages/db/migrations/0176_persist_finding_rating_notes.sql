SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "rating_note" text;
