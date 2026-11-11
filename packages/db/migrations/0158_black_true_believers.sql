SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TYPE "public"."topic_post_discussion_kind" AS ENUM('publish', 'regenerate');--> statement-breakpoint
CREATE TYPE "public"."topic_post_discussion_status" AS ENUM('recording', 'published', 'failed');--> statement-breakpoint
ALTER TYPE "public"."chat_turn_kind" ADD VALUE 'topic_post';--> statement-breakpoint
CREATE TABLE "topic_post_discussions" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_post_id" text NOT NULL,
	"user_id" text,
	"kind" "topic_post_discussion_kind" NOT NULL,
	"status" "topic_post_discussion_status" DEFAULT 'recording' NOT NULL,
	"error" text,
	"script" jsonb,
	"audio_key" text,
	"audio_byte_size" integer,
	"duration_seconds" integer,
	"model" text,
	"cost" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "topic_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"summary" text,
	"cost" numeric(12, 6) DEFAULT '0' NOT NULL,
	"image_hash" text,
	"image_origin" "topic_image_origin",
	"image_prompt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "viewer_counters" DROP CONSTRAINT "viewer_counters_ref_shape";--> statement-breakpoint
ALTER TABLE "chat_turns" ADD COLUMN "topic_post_id" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "profile_order" integer;--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD COLUMN "seen_at" timestamp with time zone;--> statement-breakpoint
-- a mention written before the badges existed counts as seen, so nobody is badged for old comments
UPDATE "comment_mentions" SET "seen_at" = now();--> statement-breakpoint
-- backfill each comment's target topic from its social target. the column stays nullable, so a replica on the
-- release before it can still insert during a deploy
ALTER TABLE "comments" ADD COLUMN "target_topic_id" text;--> statement-breakpoint
UPDATE "comments" SET "target_topic_id" = coalesce(
	"comments"."topic_id",
	(SELECT "findings"."topic_id" FROM "findings" WHERE "findings"."id" = "comments"."finding_id"),
	(SELECT "episodes"."topic_id" FROM "episodes" WHERE "episodes"."id" = "comments"."podcast_episode_id")
);--> statement-breakpoint
-- backfill each reaction's target topic the same way, and from its comment for a reaction to a comment
ALTER TABLE "reactions" ADD COLUMN "target_topic_id" text;--> statement-breakpoint
UPDATE "reactions" SET "target_topic_id" = coalesce(
	"reactions"."topic_id",
	(SELECT "findings"."topic_id" FROM "findings" WHERE "findings"."id" = "reactions"."finding_id"),
	(SELECT "episodes"."topic_id" FROM "episodes" WHERE "episodes"."id" = "reactions"."podcast_episode_id"),
	(SELECT "comments"."target_topic_id" FROM "comments" WHERE "comments"."id" = "reactions"."comment_id")
);--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "viewer_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_image_renders" ADD COLUMN "topic_post_id" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "profile_order" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_viewer_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "viewer_counters" ADD COLUMN "profile_user_id" text;--> statement-breakpoint
ALTER TABLE "viewer_counters" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "topic_post_discussions" ADD CONSTRAINT "topic_post_discussions_topic_post_id_topic_posts_id_fk" FOREIGN KEY ("topic_post_id") REFERENCES "public"."topic_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_post_discussions" ADD CONSTRAINT "topic_post_discussions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_posts" ADD CONSTRAINT "topic_posts_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_posts" ADD CONSTRAINT "topic_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_post_discussions_post_published_idx" ON "topic_post_discussions" USING btree ("topic_post_id","published_at");--> statement-breakpoint
CREATE INDEX "topic_post_discussions_user_kind_created_idx" ON "topic_post_discussions" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "topic_posts_topic_published_idx" ON "topic_posts" USING btree ("topic_id","published_at");--> statement-breakpoint
CREATE INDEX "topic_posts_author_published_idx" ON "topic_posts" USING btree ("author_user_id","published_at");--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_topic_post_id_topic_posts_id_fk" FOREIGN KEY ("topic_post_id") REFERENCES "public"."topic_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_topic_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."topic_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_target_topic_id_topics_id_fk" FOREIGN KEY ("target_topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_post_id_topic_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."topic_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_target_topic_id_topics_id_fk" FOREIGN KEY ("target_topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_image_renders" ADD CONSTRAINT "topic_image_renders_topic_post_id_topic_posts_id_fk" FOREIGN KEY ("topic_post_id") REFERENCES "public"."topic_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewer_counters" ADD CONSTRAINT "viewer_counters_profile_user_id_users_id_fk" FOREIGN KEY ("profile_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewer_counters" ADD CONSTRAINT "viewer_counters_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_turns_topic_post_id_idx" ON "chat_turns" USING btree ("topic_post_id") WHERE "chat_turns"."topic_post_id" is not null;--> statement-breakpoint
CREATE INDEX "episodes_profile_order_idx" ON "episodes" USING btree ("profile_order") WHERE "episodes"."profile_order" is not null;--> statement-breakpoint
CREATE INDEX "comment_mentions_unseen_mentioned_user_id_idx" ON "comment_mentions" USING btree ("mentioned_user_id") WHERE "comment_mentions"."seen_at" is null;--> statement-breakpoint
CREATE INDEX "comments_target_topic_created_at_idx" ON "comments" USING btree ("target_topic_id","created_at");--> statement-breakpoint
CREATE INDEX "reactions_target_topic_created_at_idx" ON "reactions" USING btree ("target_topic_id","created_at");--> statement-breakpoint
CREATE INDEX "topics_owner_profile_order_idx" ON "topics" USING btree ("owner_id","profile_order") WHERE "topics"."profile_order" is not null;--> statement-breakpoint
ALTER TABLE "viewer_counters" ADD CONSTRAINT "viewer_counters_profile_user_id_unique" UNIQUE("profile_user_id");--> statement-breakpoint
ALTER TABLE "viewer_counters" ADD CONSTRAINT "viewer_counters_team_id_unique" UNIQUE("team_id");--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_topic_post_shape" CHECK (("chat_turns"."kind"::text <> 'topic_post' and "chat_turns"."topic_post_id" is null) or ("chat_turns"."kind"::text = 'topic_post' and "chat_turns"."topic_id" is not null and "chat_turns"."team_id" is null));--> statement-breakpoint
ALTER TABLE "viewer_counters" ADD CONSTRAINT "viewer_counters_ref_shape" CHECK (num_nonnulls("viewer_counters"."topic_id", "viewer_counters"."episode_id", "viewer_counters"."profile_user_id", "viewer_counters"."team_id") = 1);