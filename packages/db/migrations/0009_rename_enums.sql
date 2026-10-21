ALTER TYPE "public"."privacy" RENAME TO "visibility";--> statement-breakpoint
ALTER TYPE "public"."cadence" RENAME TO "frequency";--> statement-breakpoint
ALTER TYPE "public"."thumbs" RENAME TO "rating";--> statement-breakpoint
ALTER TABLE "topics" RENAME COLUMN "privacy" TO "visibility";--> statement-breakpoint
ALTER TABLE "topics" RENAME COLUMN "cadence" TO "frequency";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "cadence" TO "frequency";--> statement-breakpoint
ALTER TABLE "findings" RENAME COLUMN "thumbs" TO "rating";