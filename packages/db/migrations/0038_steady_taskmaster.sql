ALTER TABLE "topics" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
-- topics that were already public were published at some unrecorded time, so they take their creation date.
-- it is the best date on the row, and it keeps them outside the daily publish window rather than inside it
UPDATE "topics" SET "published_at" = "created_at" WHERE "visibility" = 'public';
