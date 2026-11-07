SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "public"."reaction_type" AS ENUM('like', 'celebrate', 'support', 'love', 'insightful', 'funny');--> statement-breakpoint
ALTER TYPE "public"."report_resolution" ADD VALUE 'blocked';--> statement-breakpoint
ALTER TYPE "public"."report_resolution" RENAME VALUE 'kept' TO 'cleared';--> statement-breakpoint
ALTER TYPE "public"."report_subject_kind" ADD VALUE 'finding';--> statement-breakpoint
ALTER TYPE "public"."report_subject_kind" ADD VALUE 'podcastEpisode';--> statement-breakpoint
ALTER TYPE "public"."report_subject_kind" ADD VALUE 'reaction';--> statement-breakpoint
ALTER TYPE "public"."report_subject_kind" ADD VALUE 'comment';--> statement-breakpoint
CREATE TABLE "notifications_email_sends" (
	"user_id" text NOT NULL,
	"sent_day" date NOT NULL,
	"activity_end_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_email_sends_user_id_sent_day_pk" PRIMARY KEY("user_id","sent_day")
);
--> statement-breakpoint
CREATE TABLE "comment_mentions" (
	"comment_id" text NOT NULL,
	"mentioned_user_id" text NOT NULL,
	"username" text NOT NULL,
	CONSTRAINT "comment_mentions_comment_id_mentioned_user_id_pk" PRIMARY KEY("comment_id","mentioned_user_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"author_user_id" text,
	"finding_id" text,
	"podcast_episode_id" text,
	"topic_id" text,
	"post_id" text,
	"chapter_position" integer,
	"parent_comment_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_one_social_target" CHECK (num_nonnulls("comments"."finding_id", "comments"."podcast_episode_id", "comments"."topic_id", "comments"."post_id") = 1),
	CONSTRAINT "comments_chapter_on_podcast_episode" CHECK ("comments"."chapter_position" is null or "comments"."podcast_episode_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"finding_id" text,
	"podcast_episode_id" text,
	"topic_id" text,
	"post_id" text,
	"reaction_type" "reaction_type",
	"text" text,
	"text_saved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_one_social_target" CHECK (num_nonnulls("reactions"."finding_id", "reactions"."podcast_episode_id", "reactions"."topic_id", "reactions"."post_id") = 1),
	CONSTRAINT "reactions_type_or_text" CHECK ("reactions"."reaction_type" is not null or "reactions"."text" is not null),
	CONSTRAINT "reactions_text_length" CHECK (char_length("reactions"."text") <= 280)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_notifications_email_enabled" boolean DEFAULT false NOT NULL, ADD COLUMN "admin_blocked_at" timestamp with time zone, ADD COLUMN "admin_blocked_by_user_id" text;--> statement-breakpoint
ALTER TABLE "notifications_email_sends" ADD CONSTRAINT "notifications_email_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_mentioned_user_id_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_podcast_episode_id_episodes_id_fk" FOREIGN KEY ("podcast_episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_podcast_episode_id_episodes_id_fk" FOREIGN KEY ("podcast_episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_mentions_mentioned_user_id_idx" ON "comment_mentions" USING btree ("mentioned_user_id");--> statement-breakpoint
CREATE INDEX "comments_finding_created_at_idx" ON "comments" USING btree ("finding_id","created_at") WHERE "comments"."finding_id" is not null;--> statement-breakpoint
CREATE INDEX "comments_podcast_episode_created_at_idx" ON "comments" USING btree ("podcast_episode_id","created_at") WHERE "comments"."podcast_episode_id" is not null;--> statement-breakpoint
CREATE INDEX "comments_topic_created_at_idx" ON "comments" USING btree ("topic_id","created_at") WHERE "comments"."topic_id" is not null;--> statement-breakpoint
CREATE INDEX "comments_post_created_at_idx" ON "comments" USING btree ("post_id","created_at") WHERE "comments"."post_id" is not null;--> statement-breakpoint
CREATE INDEX "comments_created_at_idx" ON "comments" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reactions_user_finding_unique" ON "reactions" USING btree ("user_id","finding_id") WHERE "reactions"."finding_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "reactions_user_podcast_episode_unique" ON "reactions" USING btree ("user_id","podcast_episode_id") WHERE "reactions"."podcast_episode_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "reactions_user_topic_unique" ON "reactions" USING btree ("user_id","topic_id") WHERE "reactions"."topic_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "reactions_user_post_unique" ON "reactions" USING btree ("user_id","post_id") WHERE "reactions"."post_id" is not null;--> statement-breakpoint
CREATE INDEX "reactions_finding_created_at_idx" ON "reactions" USING btree ("finding_id","created_at") WHERE "reactions"."finding_id" is not null;--> statement-breakpoint
CREATE INDEX "reactions_podcast_episode_created_at_idx" ON "reactions" USING btree ("podcast_episode_id","created_at") WHERE "reactions"."podcast_episode_id" is not null;--> statement-breakpoint
CREATE INDEX "reactions_topic_created_at_idx" ON "reactions" USING btree ("topic_id","created_at") WHERE "reactions"."topic_id" is not null;--> statement-breakpoint
CREATE INDEX "reactions_post_created_at_idx" ON "reactions" USING btree ("post_id","created_at") WHERE "reactions"."post_id" is not null;--> statement-breakpoint
CREATE INDEX "reactions_created_at_idx" ON "reactions" USING btree ("created_at");