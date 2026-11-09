SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "image_hash" text;