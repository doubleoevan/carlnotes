CREATE TABLE "chat_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"topic_id" text,
	"chat_turn_id" text NOT NULL,
	"digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_proposals_page_unique" UNIQUE NULLS NOT DISTINCT("user_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"name" text PRIMARY KEY NOT NULL,
	"holder_id" text NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_proposals" ADD CONSTRAINT "chat_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_proposals" ADD CONSTRAINT "chat_proposals_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_proposals" ADD CONSTRAINT "chat_proposals_chat_turn_id_chat_turns_id_fk" FOREIGN KEY ("chat_turn_id") REFERENCES "public"."chat_turns"("id") ON DELETE cascade ON UPDATE no action;