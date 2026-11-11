SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE INDEX "invites_topic_post_id_idx" ON "invites" USING btree ("topic_post_id") WHERE "invites"."topic_post_id" is not null;--> statement-breakpoint
CREATE INDEX "topic_podcast_episode_video_sections_episode_id_idx" ON "topic_podcast_episode_video_sections" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "topic_image_renders_topic_post_id_idx" ON "topic_image_renders" USING btree ("topic_post_id") WHERE "topic_image_renders"."topic_post_id" is not null;--> statement-breakpoint
CREATE INDEX "topic_image_renders_topic_podcast_episode_video_id_idx" ON "topic_image_renders" USING btree ("topic_podcast_episode_video_id") WHERE "topic_image_renders"."topic_podcast_episode_video_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "topic_post_discussions_post_recording_unique" ON "topic_post_discussions" USING btree ("topic_post_id") WHERE "topic_post_discussions"."status" = 'recording';--> statement-breakpoint
CREATE INDEX "topic_posts_published_at_idx" ON "topic_posts" USING btree ("published_at");