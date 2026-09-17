CREATE TABLE "topic_drafts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"topic_draft" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topic_drafts" ADD CONSTRAINT "topic_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;