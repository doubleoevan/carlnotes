SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "topic_post_id" text;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_topic_post_id_topic_posts_id_fk" FOREIGN KEY ("topic_post_id") REFERENCES "public"."topic_posts"("id") ON DELETE set null ON UPDATE no action;