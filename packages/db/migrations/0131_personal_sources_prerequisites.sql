ALTER TYPE "public"."source_kind" ADD VALUE 'ai_agent';--> statement-breakpoint
ALTER TYPE "public"."source_kind" ADD VALUE 'email';--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "personal_source_identity" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "personal_source_user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "personal_source_connection_dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_personal_source_user_id_users_id_fk" FOREIGN KEY ("personal_source_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sources_id_topic_unique" ON "sources" USING btree ("id","topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_personal_source_sender_identity_unique" ON "sources" USING btree ("topic_id","personal_source_user_id","personal_source_identity");--> statement-breakpoint
CREATE UNIQUE INDEX "topics_id_owner_unique" ON "topics" USING btree ("id","owner_id");--> statement-breakpoint
CREATE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_id_topic_sender_unique" UNIQUE("id","topic_id","personal_source_user_id");--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_personal_source_identity_shape" CHECK (("sources"."kind"::text in ('ai_agent', 'email')) = ("sources"."personal_source_identity" is not null));