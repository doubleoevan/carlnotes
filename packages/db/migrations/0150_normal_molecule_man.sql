SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE INDEX "comments_author_user_id_idx" ON "comments" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "comments_aired_podcast_episode_idx" ON "comments" USING btree ("aired_podcast_episode_id") WHERE "comments"."aired_podcast_episode_id" is not null;--> statement-breakpoint
CREATE INDEX "reactions_user_id_idx" ON "reactions" USING btree ("user_id");