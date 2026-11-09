SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "image_hash" text;