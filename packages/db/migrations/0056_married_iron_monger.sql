CREATE TABLE "room_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"message_id" bigint NOT NULL,
	"uploader_user_id" text,
	"uploader_username" text NOT NULL,
	"kind" "chat_attachment_kind" NOT NULL,
	"name" text NOT NULL,
	"object_key" text,
	"content_type" text,
	"byte_size" integer,
	"context" text DEFAULT '' NOT NULL,
	"status" "attachment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_attachments_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "room_attachments" ADD CONSTRAINT "room_attachments_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_attachments" ADD CONSTRAINT "room_attachments_uploader_user_id_users_id_fk" FOREIGN KEY ("uploader_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_attachments_topic_id_idx" ON "room_attachments" USING btree ("topic_id");