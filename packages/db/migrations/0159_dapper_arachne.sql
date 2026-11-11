SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TYPE "public"."report_subject_kind" ADD VALUE 'topicPostImage';--> statement-breakpoint
ALTER TABLE "topic_posts" ADD COLUMN "image_updated_at" timestamp with time zone;