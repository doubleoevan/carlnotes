SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "image_origin" "topic_image_origin";--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "image_prompt" text;--> statement-breakpoint
ALTER TABLE "topic_image_renders" ADD COLUMN "podcast_episode_id" text;--> statement-breakpoint
ALTER TABLE "topic_image_renders" ADD CONSTRAINT "topic_image_renders_podcast_episode_id_episodes_id_fk" FOREIGN KEY ("podcast_episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;