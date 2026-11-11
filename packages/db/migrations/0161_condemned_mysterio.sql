SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TYPE "public"."episode_video_status" AS ENUM('rendering', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "topic_podcast_episode_video_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"is_open" boolean NOT NULL,
	"episode_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_podcast_episode_videos" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"status" "episode_video_status" DEFAULT 'rendering' NOT NULL,
	"error" text,
	"intro_key" text,
	"chapters_key" text,
	"sign_off_key" text,
	"film_key" text,
	"captions_key" text,
	"byte_size" integer,
	"duration_seconds" integer,
	"rendered_image_hash" text,
	"image_hash" text,
	"image_origin" "topic_image_origin",
	"image_prompt" text,
	"cost" numeric(12, 6) DEFAULT '0' NOT NULL,
	"home_order" integer,
	"profile_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episode_listens" ADD COLUMN "video_play_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_image_renders" ADD COLUMN "topic_podcast_episode_video_id" text;--> statement-breakpoint
ALTER TABLE "topic_podcast_episode_video_sections" ADD CONSTRAINT "topic_podcast_episode_video_sections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_podcast_episode_video_sections" ADD CONSTRAINT "topic_podcast_episode_video_sections_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_podcast_episode_video_sections" ADD CONSTRAINT "topic_podcast_episode_video_sections_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_podcast_episode_videos" ADD CONSTRAINT "topic_podcast_episode_videos_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "topic_podcast_episode_video_sections_user_topic_unique" ON "topic_podcast_episode_video_sections" USING btree ("user_id","topic_id");--> statement-breakpoint
CREATE INDEX "topic_podcast_episode_video_sections_topic_id_idx" ON "topic_podcast_episode_video_sections" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_podcast_episode_videos_episode_unique" ON "topic_podcast_episode_videos" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "topic_podcast_episode_videos_home_order_idx" ON "topic_podcast_episode_videos" USING btree ("home_order") WHERE "topic_podcast_episode_videos"."home_order" is not null;--> statement-breakpoint
ALTER TABLE "topic_image_renders" ADD CONSTRAINT "topic_image_renders_topic_podcast_episode_video_id_topic_podcast_episode_videos_id_fk" FOREIGN KEY ("topic_podcast_episode_video_id") REFERENCES "public"."topic_podcast_episode_videos"("id") ON DELETE cascade ON UPDATE no action;