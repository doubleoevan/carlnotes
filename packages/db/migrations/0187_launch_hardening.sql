SET LOCAL lock_timeout = '3s';--> statement-breakpoint
-- the reaper records on a row that it started the row's work again. if not exists skips the index of the recordings in
-- progress if it was built concurrently by hand before the deploy
ALTER TABLE "episodes" ADD COLUMN "restarted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_videos" ADD COLUMN "restarted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_image_renders" ADD COLUMN "restarted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_post_discussions" ADD COLUMN "restarted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "restarted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_recording_created_idx" ON "episodes" USING btree ("created_at") WHERE "episodes"."status" = 'recording';
--> statement-breakpoint
-- the paid calls that no other row records. a row with a user bills that user, and a row with no user is the
-- platform's own cost. the table is new, so its two indexes are built with it
CREATE TABLE "spends" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"user_id" text,
	"topic_id" text,
	"podcast_episode_id" text,
	"cost" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spends_cost_nonnegative" CHECK ("spends"."cost" >= 0)
);
--> statement-breakpoint
ALTER TABLE "spends" ADD CONSTRAINT "spends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spends" ADD CONSTRAINT "spends_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spends" ADD CONSTRAINT "spends_podcast_episode_id_episodes_id_fk" FOREIGN KEY ("podcast_episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spends_created_idx" ON "spends" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "spends_user_created_idx" ON "spends" USING btree ("user_id","created_at");
--> statement-breakpoint
-- the day's spend sums eight tables by time, the sweep counts signups by time, and it reads the Scans still running
-- and the Sources still pending. if not exists skips each index that was built concurrently by hand before the
-- deploy, which keeps a large table writable while it builds
CREATE INDEX IF NOT EXISTS "chat_turns_created_idx" ON "chat_turns" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personal_source_distillation_spends_created_idx" ON "personal_source_distillation_spends" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_created_idx" ON "episodes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_videos_created_idx" ON "topic_videos" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scans_started_idx" ON "scans" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scans_running_started_idx" ON "scans" USING btree ("started_at","id") WHERE "scans"."status" = 'running';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_image_renders_created_idx" ON "topic_image_renders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_post_discussions_created_idx" ON "topic_post_discussions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sources_pending_topic_idx" ON "sources" USING btree ("topic_id") WHERE "sources"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_created_idx" ON "users" USING btree ("created_at");
--> statement-breakpoint
-- a row of a day with nothing to send, which is not an email. every existing row is an email's, so the default holds
ALTER TABLE "notifications_email_sends" ADD COLUMN "is_quiet" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- the record that a topic's max-results filter removed its finding of a resource, which a later scan reads to skip the
-- page. the table is new, so its index is built with it
CREATE TABLE "filtered_findings" (
	"topic_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"reviewed_context_hash" text NOT NULL,
	"reviewed_content_hash" text,
	"relevance_score" real NOT NULL,
	"personal_source_score_bonus" real DEFAULT 0 NOT NULL,
	"filtered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filtered_findings_topic_id_resource_id_pk" PRIMARY KEY("topic_id","resource_id")
);
--> statement-breakpoint
ALTER TABLE "filtered_findings" ADD CONSTRAINT "filtered_findings_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filtered_findings" ADD CONSTRAINT "filtered_findings_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "filtered_findings_resource_id_idx" ON "filtered_findings" USING btree ("resource_id");
