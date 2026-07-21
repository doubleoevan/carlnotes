ALTER TABLE "subscriptions" DROP COLUMN "digest";--> statement-breakpoint
ALTER TABLE "topics" RENAME COLUMN "context" TO "prompt";