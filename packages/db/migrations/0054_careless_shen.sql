CREATE TABLE "room_mentions" (
	"message_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "room_mentions_message_id_user_id_pk" PRIMARY KEY("message_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "room_messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "room_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"topic_id" text NOT NULL,
	"author_user_id" text,
	"author_username" text NOT NULL,
	"reply_to_message_id" bigint,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_summaries" (
	"topic_id" text PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"summarized_through_message_id" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_turns" ADD COLUMN "room_message_id" bigint;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD COLUMN "total_tokens" integer;--> statement-breakpoint
ALTER TABLE "room_mentions" ADD CONSTRAINT "room_mentions_message_id_room_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."room_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_mentions" ADD CONSTRAINT "room_mentions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_summaries" ADD CONSTRAINT "room_summaries_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_messages_topic_id_idx" ON "room_messages" USING btree ("topic_id","id");