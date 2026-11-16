SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TYPE "public"."topic_memory_kind" AS ENUM('fact', 'player', 'storyline', 'trend', 'open_question', 'correction');--> statement-breakpoint
CREATE TYPE "public"."topic_memory_status" AS ENUM('active', 'outdated', 'rejected');--> statement-breakpoint
CREATE TABLE "topic_memories" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"kind" "topic_memory_kind" NOT NULL,
	"text" text NOT NULL,
	"player_key" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_match_id" text,
	"importance" real NOT NULL,
	"status" "topic_memory_status" DEFAULT 'active' NOT NULL,
	"replaced_by_id" text,
	"first_scan_id" text NOT NULL,
	"last_seen_scan_id" text NOT NULL,
	"finding_ids" text[] NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"embedding_model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_memories_player_key" CHECK (("topic_memories"."kind" = 'player') = ("topic_memories"."player_key" is not null)),
	CONSTRAINT "topic_memories_text_length" CHECK (char_length("topic_memories"."text") between 1 and 400),
	CONSTRAINT "topic_memories_importance_range" CHECK ("topic_memories"."importance" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "topic_memory_feedback" (
	"topic_memory_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" "rating" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_memory_feedback_topic_memory_id_user_id_pk" PRIMARY KEY("topic_memory_id","user_id"),
	CONSTRAINT "topic_memory_feedback_note_length" CHECK (char_length("topic_memory_feedback"."note") <= 400)
);
--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "topic_memories_consolidated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_memories" ADD CONSTRAINT "topic_memories_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_memories" ADD CONSTRAINT "topic_memories_review_match_id_topic_memories_id_fk" FOREIGN KEY ("review_match_id") REFERENCES "public"."topic_memories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_memories" ADD CONSTRAINT "topic_memories_replaced_by_id_topic_memories_id_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "public"."topic_memories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_memories" ADD CONSTRAINT "topic_memories_first_scan_id_scans_id_fk" FOREIGN KEY ("first_scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_memories" ADD CONSTRAINT "topic_memories_last_seen_scan_id_scans_id_fk" FOREIGN KEY ("last_seen_scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_memory_feedback" ADD CONSTRAINT "topic_memory_feedback_topic_memory_id_topic_memories_id_fk" FOREIGN KEY ("topic_memory_id") REFERENCES "public"."topic_memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_memory_feedback" ADD CONSTRAINT "topic_memory_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_memories_topic_status_importance_idx" ON "topic_memories" USING btree ("topic_id","status","importance");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_memories_active_player_key_idx" ON "topic_memories" USING btree ("topic_id","player_key") WHERE "topic_memories"."status" = 'active' and "topic_memories"."kind" = 'player';