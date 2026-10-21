ALTER TYPE "public"."source_kind" ADD VALUE IF NOT EXISTS 'podcast' BEFORE 'search';--> statement-breakpoint
ALTER TYPE "public"."source_kind" ADD VALUE IF NOT EXISTS 'bluesky' BEFORE 'composio';--> statement-breakpoint
ALTER TYPE "public"."source_kind" ADD VALUE IF NOT EXISTS 'x' BEFORE 'composio';--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "transcript_url" text;--> statement-breakpoint
ALTER TABLE "scans" RENAME COLUMN "fallback_sources" TO "problem_sources";
