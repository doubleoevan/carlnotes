ALTER TABLE "scans" DROP CONSTRAINT "scans_topic_id_topics_id_fk";
--> statement-breakpoint
ALTER TABLE "scans" ALTER COLUMN "topic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "owner_id" text;--> statement-breakpoint
UPDATE "scans" SET "owner_id" = "topics"."owner_id" FROM "topics" WHERE "scans"."topic_id" = "topics"."id";--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;