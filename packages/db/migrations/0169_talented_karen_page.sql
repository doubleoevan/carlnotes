SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TYPE "public"."unchecked_image_subject_kind" AS ENUM('userAvatar', 'teamAvatar', 'topicImage', 'podcastEpisodeImage', 'topicPostImage', 'topicPodcastEpisodeVideoImage');--> statement-breakpoint
CREATE TABLE "unchecked_images" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_kind" "unchecked_image_subject_kind" NOT NULL,
	"subject_id" text NOT NULL,
	"uploader_user_id" text,
	"avatar_key" text,
	"image_hash" text,
	"width" integer,
	"height" integer,
	"is_published" boolean DEFAULT false NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"reported_at" timestamp with time zone,
	CONSTRAINT "unchecked_images_key_shape" CHECK (("unchecked_images"."subject_kind" in ('userAvatar', 'teamAvatar') and "unchecked_images"."avatar_key" is not null and "unchecked_images"."image_hash" is null) or ("unchecked_images"."subject_kind" not in ('userAvatar', 'teamAvatar') and "unchecked_images"."image_hash" is not null and "unchecked_images"."avatar_key" is null))
);
--> statement-breakpoint
ALTER TABLE "spend_control_settings" ADD COLUMN "is_podcast_episode_recording_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "spend_control_settings" ADD COLUMN "is_topic_podcast_episode_video_rendering_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "spend_control_settings" ADD COLUMN "generated_chapter_image_limit" integer;--> statement-breakpoint
ALTER TABLE "spend_control_settings" ADD COLUMN "is_home_pinned_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "unchecked_avatar_key" text;--> statement-breakpoint
ALTER TABLE "unchecked_images" ADD CONSTRAINT "unchecked_images_uploader_user_id_users_id_fk" FOREIGN KEY ("uploader_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unchecked_images_subject_unique" ON "unchecked_images" USING btree ("subject_kind","subject_id");--> statement-breakpoint
ALTER TABLE "spend_control_settings" ADD CONSTRAINT "spend_control_settings_generated_chapter_image_limit" CHECK (coalesce("spend_control_settings"."generated_chapter_image_limit", 0) >= 0);