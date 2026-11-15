SET LOCAL lock_timeout = '3s';--> statement-breakpoint
-- the previous release no longer reads topic_podcast_episode_videos or topic_podcast_episode_video_sections as tables. a view under each old name passes the previous release's queries through to the renamed table
SET LOCAL statement_timeout = '60s';--> statement-breakpoint
ALTER TABLE "topic_podcast_episode_videos" RENAME TO "topic_videos";--> statement-breakpoint
ALTER TABLE "topic_podcast_episode_video_sections" RENAME TO "topic_video_sections";--> statement-breakpoint
ALTER TABLE "topic_videos" RENAME CONSTRAINT "topic_podcast_episode_videos_episode_id_episodes_id_fk" TO "topic_videos_episode_id_episodes_id_fk";--> statement-breakpoint
ALTER TABLE "topic_video_sections" RENAME CONSTRAINT "topic_podcast_episode_video_sections_user_id_users_id_fk" TO "topic_video_sections_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "topic_video_sections" RENAME CONSTRAINT "topic_podcast_episode_video_sections_topic_id_topics_id_fk" TO "topic_video_sections_topic_id_topics_id_fk";--> statement-breakpoint
ALTER TABLE "topic_video_sections" RENAME CONSTRAINT "topic_podcast_episode_video_sections_episode_id_episodes_id_fk" TO "topic_video_sections_episode_id_episodes_id_fk";--> statement-breakpoint
ALTER TABLE "topic_image_renders" RENAME CONSTRAINT "topic_image_renders_topic_podcast_episode_video_id_topic_podcas" TO "topic_image_renders_topic_podcast_episode_video_id_topic_videos";--> statement-breakpoint
ALTER INDEX "topic_podcast_episode_videos_pkey" RENAME TO "topic_videos_pkey";--> statement-breakpoint
ALTER INDEX "topic_podcast_episode_videos_episode_unique" RENAME TO "topic_videos_episode_unique";--> statement-breakpoint
ALTER INDEX "topic_podcast_episode_videos_home_order_idx" RENAME TO "topic_videos_home_order_idx";--> statement-breakpoint
ALTER INDEX "topic_podcast_episode_video_sections_pkey" RENAME TO "topic_video_sections_pkey";--> statement-breakpoint
ALTER INDEX "topic_podcast_episode_video_sections_user_topic_unique" RENAME TO "topic_video_sections_user_topic_unique";--> statement-breakpoint
ALTER INDEX "topic_podcast_episode_video_sections_topic_id_idx" RENAME TO "topic_video_sections_topic_id_idx";--> statement-breakpoint
ALTER INDEX "topic_podcast_episode_video_sections_episode_id_idx" RENAME TO "topic_video_sections_episode_id_idx";--> statement-breakpoint
ALTER INDEX "topic_image_renders_topic_podcast_episode_video_id_idx" RENAME TO "topic_image_renders_topic_video_id_idx";--> statement-breakpoint
DO $$
DECLARE
	not_null_constraint record;
BEGIN
	FOR not_null_constraint IN
		SELECT conrelid::regclass AS table_name, conname
		FROM pg_constraint
		WHERE contype = 'n'
			AND conrelid IN ('topic_videos'::regclass, 'topic_video_sections'::regclass)
			AND conname LIKE 'topic\_podcast\_episode\_video%'
	LOOP
		EXECUTE format(
			'ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
			not_null_constraint.table_name,
			not_null_constraint.conname,
			replace(not_null_constraint.conname, 'topic_podcast_episode_video', 'topic_video')
		);
	END LOOP;
END $$;--> statement-breakpoint
CREATE VIEW "topic_podcast_episode_videos" AS SELECT * FROM "topic_videos";--> statement-breakpoint
CREATE VIEW "topic_podcast_episode_video_sections" AS SELECT * FROM "topic_video_sections";--> statement-breakpoint
COMMENT ON VIEW "topic_podcast_episode_videos" IS 'the old name of topic_videos, read and written by the previous release, until a later migration drops it';--> statement-breakpoint
COMMENT ON VIEW "topic_podcast_episode_video_sections" IS 'the old name of topic_video_sections, read by the previous release, until a later migration drops it';
