-- every pending migration runs in one transaction, so the lock timeout, set first, bounds how long each ALTER below
-- waits behind a long query on topics, findings, or episodes, and a deploy that cannot get a lock in time fails fast
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TABLE "viewer_counters" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text,
	"episode_id" text,
	"counter" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "viewer_counters_topic_id_unique" UNIQUE("topic_id"),
	CONSTRAINT "viewer_counters_episode_id_unique" UNIQUE("episode_id"),
	CONSTRAINT "viewer_counters_ref_shape" CHECK (("viewer_counters"."topic_id" is not null) <> ("viewer_counters"."episode_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "listener_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "viewer_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "viewer_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "viewer_counters" ADD CONSTRAINT "viewer_counters_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewer_counters" ADD CONSTRAINT "viewer_counters_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;