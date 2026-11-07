SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "is_podcast_comments_enabled" boolean DEFAULT true NOT NULL;