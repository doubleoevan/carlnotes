CREATE TABLE "topic_email_sends" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"email_kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topic_email_sends" ADD CONSTRAINT "topic_email_sends_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;