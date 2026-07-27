CREATE TYPE "public"."attachment_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "status" "attachment_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "char_count" integer;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "chunk_count" integer;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "content_key" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "content_bytes" integer;--> statement-breakpoint
-- existing attachments were processed synchronously before this change, so they are already ready
UPDATE "attachments" SET "status" = 'ready';