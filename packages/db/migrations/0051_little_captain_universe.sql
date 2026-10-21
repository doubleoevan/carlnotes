ALTER TABLE "audience_members" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audiences" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "audience_members" CASCADE;--> statement-breakpoint
DROP TABLE "audiences" CASCADE;--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_subscriber_xor";--> statement-breakpoint
DELETE FROM "subscriptions" WHERE "subscriber_user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "subscriber_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "subscriber_audience_id";