ALTER TABLE "personal_source_entries" DROP CONSTRAINT "personal_source_entries_retention";--> statement-breakpoint
DROP INDEX "personal_source_entries_expiry_idx";--> statement-breakpoint
ALTER TABLE "finding_personal_annotations" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "personal_source_entries" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "topic_personal_source_contexts" DROP COLUMN "earliest_expiry";