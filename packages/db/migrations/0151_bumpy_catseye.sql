SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "comments" RENAME COLUMN "shared_with_carl_at" TO "shared_with_podcast_at";--> statement-breakpoint
ALTER TABLE "comments" RENAME COLUMN "shared_topic_id" TO "shared_with_podcast_topic_id";--> statement-breakpoint
ALTER TABLE "comments" RENAME CONSTRAINT "comments_shared_with_topic" TO "comments_shared_with_podcast_topic";--> statement-breakpoint
ALTER TABLE "comments" RENAME CONSTRAINT "comments_shared_topic_id_topics_id_fk" TO "comments_shared_with_podcast_topic_id_topics_id_fk";--> statement-breakpoint
ALTER INDEX "comments_shared_topic_idx" RENAME TO "comments_shared_with_podcast_topic_idx";