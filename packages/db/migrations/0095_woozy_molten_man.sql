CREATE TYPE "public"."episode_status" AS ENUM('rendering', 'published', 'failed', 'removed');--> statement-breakpoint
CREATE TABLE "episode_chapters" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"position" integer NOT NULL,
	"finding_id" text,
	"resource_id" text NOT NULL,
	"title" text NOT NULL,
	"source_url" text NOT NULL,
	"start_seconds" real NOT NULL,
	"end_seconds" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_feed_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_listens" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"user_id" text NOT NULL,
	"play_count" integer DEFAULT 0 NOT NULL,
	"progress_seconds" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text,
	"owner_id" text NOT NULL,
	"scan_id" text,
	"status" "episode_status" DEFAULT 'rendering' NOT NULL,
	"error" text,
	"title" text,
	"description" text,
	"season" integer,
	"number" integer,
	"audio_key" text,
	"audio_byte_size" integer,
	"duration_seconds" integer,
	"model" text,
	"cost" numeric(12, 6) DEFAULT '0' NOT NULL,
	"script" jsonb,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "is_podcast_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "episode_chapters" ADD CONSTRAINT "episode_chapters_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_chapters" ADD CONSTRAINT "episode_chapters_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_chapters" ADD CONSTRAINT "episode_chapters_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_feed_tokens" ADD CONSTRAINT "episode_feed_tokens_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_feed_tokens" ADD CONSTRAINT "episode_feed_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_listens" ADD CONSTRAINT "episode_listens_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_listens" ADD CONSTRAINT "episode_listens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "episode_chapters_episode_position_unique" ON "episode_chapters" USING btree ("episode_id","position");--> statement-breakpoint
CREATE INDEX "episode_chapters_resource_id_idx" ON "episode_chapters" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "episode_chapters_finding_id_idx" ON "episode_chapters" USING btree ("finding_id");--> statement-breakpoint
CREATE UNIQUE INDEX "episode_feed_tokens_token_unique" ON "episode_feed_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "episode_feed_tokens_topic_user_unique" ON "episode_feed_tokens" USING btree ("topic_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "episode_listens_episode_user_unique" ON "episode_listens" USING btree ("episode_id","user_id");--> statement-breakpoint
CREATE INDEX "episode_listens_user_id_idx" ON "episode_listens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_scan_unique" ON "episodes" USING btree ("scan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_topic_season_number_unique" ON "episodes" USING btree ("topic_id","season","number");--> statement-breakpoint
CREATE INDEX "episodes_topic_published_idx" ON "episodes" USING btree ("topic_id","published_at");--> statement-breakpoint
CREATE INDEX "episodes_owner_created_idx" ON "episodes" USING btree ("owner_id","created_at");