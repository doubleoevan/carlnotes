SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "comment_links" (
	"id" text PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"url" text NOT NULL,
	"considered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reactions" DROP CONSTRAINT "reactions_one_social_target";--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "shared_with_carl_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "shared_topic_id" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "aired_podcast_episode_id" text;--> statement-breakpoint
ALTER TABLE "reactions" ADD COLUMN "comment_id" text;--> statement-breakpoint
ALTER TABLE "comment_links" ADD CONSTRAINT "comment_links_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_links" ADD CONSTRAINT "comment_links_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_links_comment_url_unique" ON "comment_links" USING btree ("comment_id","url");--> statement-breakpoint
CREATE INDEX "comment_links_topic_pending_idx" ON "comment_links" USING btree ("topic_id") WHERE "comment_links"."considered_at" is null;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_shared_topic_id_topics_id_fk" FOREIGN KEY ("shared_topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_aired_podcast_episode_id_episodes_id_fk" FOREIGN KEY ("aired_podcast_episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_parent_created_at_idx" ON "comments" USING btree ("parent_comment_id","created_at") WHERE "comments"."parent_comment_id" is not null;--> statement-breakpoint
CREATE INDEX "comments_shared_topic_idx" ON "comments" USING btree ("shared_topic_id","shared_with_carl_at") WHERE "comments"."shared_topic_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "reactions_user_comment_unique" ON "reactions" USING btree ("user_id","comment_id") WHERE "reactions"."comment_id" is not null;--> statement-breakpoint
CREATE INDEX "reactions_comment_idx" ON "reactions" USING btree ("comment_id") WHERE "reactions"."comment_id" is not null;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_shared_with_topic" CHECK (("comments"."shared_with_carl_at" is null) = ("comments"."shared_topic_id" is null));--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_one_social_target" CHECK (num_nonnulls("reactions"."finding_id", "reactions"."podcast_episode_id", "reactions"."topic_id", "reactions"."post_id", "reactions"."comment_id") = 1);