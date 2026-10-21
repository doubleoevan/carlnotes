CREATE TABLE IF NOT EXISTS "topic_invites" (
	"topic_id" text NOT NULL,
	"email" text NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_invites_topic_id_email_pk" PRIMARY KEY("topic_id","email")
);
--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "is_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "topic_invites" ADD CONSTRAINT "topic_invites_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;