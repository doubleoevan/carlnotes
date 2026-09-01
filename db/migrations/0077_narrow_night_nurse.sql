CREATE TYPE "public"."note_scope" AS ENUM('private', 'team', 'public');--> statement-breakpoint
CREATE TABLE "note_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"author_user_id" text,
	"body" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"note_id" text NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text,
	"team_id" text,
	"name" text NOT NULL,
	"scope" "note_scope" NOT NULL,
	"owner_user_id" text NOT NULL,
	"ydoc" "bytea" NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_one_subject" CHECK (("notes"."topic_id" is null) <> ("notes"."team_id" is null))
);
--> statement-breakpoint
ALTER TABLE "note_comments" ADD CONSTRAINT "note_comments_thread_id_note_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."note_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_comments" ADD CONSTRAINT "note_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_threads" ADD CONSTRAINT "note_threads_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_comments_thread_id_idx" ON "note_comments" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "note_threads_note_id_idx" ON "note_threads" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "notes_topic_id_idx" ON "notes" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "notes_team_id_idx" ON "notes" USING btree ("team_id");