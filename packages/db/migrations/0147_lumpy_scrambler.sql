SET LOCAL lock_timeout = '5s';--> statement-breakpoint
INSERT INTO "comments" ("id", "author_user_id", "finding_id", "podcast_episode_id", "topic_id", "post_id", "body", "created_at", "updated_at") SELECT gen_random_uuid()::text, "user_id", "finding_id", "podcast_episode_id", "topic_id", "post_id", "text", coalesce("text_saved_at", "created_at"), now() FROM "reactions" WHERE "text" IS NOT NULL;--> statement-breakpoint
DELETE FROM "reactions" WHERE "reaction_type" IS NULL;--> statement-breakpoint
DELETE FROM "reports" WHERE "subject_kind"::text = 'reaction';--> statement-breakpoint
ALTER TABLE "reactions" DROP CONSTRAINT "reactions_type_or_text";--> statement-breakpoint
ALTER TABLE "reactions" DROP CONSTRAINT "reactions_text_length";--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "subject_kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."report_subject_kind";--> statement-breakpoint
CREATE TYPE "public"."report_subject_kind" AS ENUM('topic', 'profile', 'team', 'chatMessage', 'note', 'noteComment', 'finding', 'podcastEpisode', 'comment');--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "subject_kind" SET DATA TYPE "public"."report_subject_kind" USING "subject_kind"::"public"."report_subject_kind";--> statement-breakpoint
ALTER TABLE "reactions" ALTER COLUMN "reaction_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reactions" DROP COLUMN "text";--> statement-breakpoint
ALTER TABLE "reactions" DROP COLUMN "text_saved_at";