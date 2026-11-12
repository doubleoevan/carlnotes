SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TYPE "public"."dashboard_access_level" AS ENUM('public', 'full');--> statement-breakpoint
CREATE TYPE "public"."dashboard_kind" AS ENUM('topicDashboard', 'podcastDashboard', 'teamDashboard');--> statement-breakpoint
CREATE TYPE "public"."podcast_episode_format" AS ENUM('audio', 'video');--> statement-breakpoint
CREATE TYPE "public"."view_item_kind" AS ENUM('topic', 'finding', 'topicPost');--> statement-breakpoint
CREATE TABLE "dashboard_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"dashboard_kind" "dashboard_kind" NOT NULL,
	"subject_id" text NOT NULL,
	"selection" text NOT NULL,
	"access_level" "dashboard_access_level" NOT NULL,
	"day" date NOT NULL,
	"body" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"paragraph" text,
	"image_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_play_counts" (
	"podcast_episode_id" text NOT NULL,
	"format" "podcast_episode_format" NOT NULL,
	"day" date NOT NULL,
	"place_key" text NOT NULL,
	"country" text,
	"region" text,
	"city" text,
	"latitude" numeric,
	"longitude" numeric,
	"play_count" integer DEFAULT 0 NOT NULL,
	"listener_sketch" "bytea",
	CONSTRAINT "daily_play_counts_podcast_episode_id_format_day_place_key_pk" PRIMARY KEY("podcast_episode_id","format","day","place_key")
);
--> statement-breakpoint
CREATE TABLE "daily_view_counts" (
	"item_kind" "view_item_kind" NOT NULL,
	"item_id" text NOT NULL,
	"day" date NOT NULL,
	"place_key" text NOT NULL,
	"country" text,
	"region" text,
	"city" text,
	"latitude" numeric,
	"longitude" numeric,
	"view_count" integer DEFAULT 0 NOT NULL,
	"viewer_sketch" "bytea",
	CONSTRAINT "daily_view_counts_item_kind_item_id_day_place_key_pk" PRIMARY KEY("item_kind","item_id","day","place_key")
);
--> statement-breakpoint
ALTER TABLE "topic_posts" ADD COLUMN "viewer_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dashboard_link_month" text;--> statement-breakpoint
ALTER TABLE "daily_play_counts" ADD CONSTRAINT "daily_play_counts_podcast_episode_id_episodes_id_fk" FOREIGN KEY ("podcast_episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_snapshots_subject_idx" ON "dashboard_snapshots" USING btree ("dashboard_kind","subject_id","selection","access_level");--> statement-breakpoint
CREATE INDEX "daily_play_counts_day_idx" ON "daily_play_counts" USING btree ("day");--> statement-breakpoint
CREATE INDEX "daily_view_counts_day_idx" ON "daily_view_counts" USING btree ("day");--> statement-breakpoint
ALTER TABLE "viewer_counters" DROP CONSTRAINT "viewer_counters_ref_shape", ADD COLUMN "topic_post_id" text, ADD CONSTRAINT "viewer_counters_topic_post_id_topic_posts_id_fk" FOREIGN KEY ("topic_post_id") REFERENCES "public"."topic_posts"("id") ON DELETE cascade ON UPDATE no action, ADD CONSTRAINT "viewer_counters_topic_post_id_unique" UNIQUE("topic_post_id"), ADD CONSTRAINT "viewer_counters_ref_shape" CHECK (num_nonnulls("viewer_counters"."topic_id", "viewer_counters"."episode_id", "viewer_counters"."profile_user_id", "viewer_counters"."team_id", "viewer_counters"."topic_post_id") = 1);