SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "topic_posts" ADD COLUMN "home_order" integer;--> statement-breakpoint
ALTER TABLE "topic_posts" ADD COLUMN "profile_order" integer;--> statement-breakpoint
CREATE INDEX "topic_posts_home_order_idx" ON "topic_posts" USING btree ("home_order") WHERE "topic_posts"."home_order" is not null;--> statement-breakpoint
CREATE INDEX "topic_posts_author_profile_order_idx" ON "topic_posts" USING btree ("author_user_id","profile_order") WHERE "topic_posts"."profile_order" is not null;