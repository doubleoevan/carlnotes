CREATE TYPE "public"."source_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "status" "source_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "error" text;--> statement-breakpoint
-- every existing source has already been trusted, and leaving them pending would hide every source from readers
-- and make every scan ingest nothing, so they are marked ready rather than queued for a screen that will never run
UPDATE "sources" SET "status" = 'ready';
