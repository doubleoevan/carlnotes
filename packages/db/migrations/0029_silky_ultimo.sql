DO $$ BEGIN CREATE TYPE "public"."chat_attachment_kind" AS ENUM('image', 'pdf', 'text'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"kind" "chat_attachment_kind" NOT NULL,
	"name" text NOT NULL,
	"object_key" text,
	"content_type" text,
	"byte_size" integer,
	"raw_text" text,
	"context" text DEFAULT '' NOT NULL,
	"status" "attachment_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"topic_id" text NOT NULL,
	"cost" numeric(12, 6) DEFAULT '0' NOT NULL,
	"question" text,
	"answer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_attachments_user_topic_idx" ON "chat_attachments" USING btree ("user_id","topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_turns_topic_created_idx" ON "chat_turns" USING btree ("topic_id","created_at");