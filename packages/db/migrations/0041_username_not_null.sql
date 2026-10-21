-- every user holds a username from the moment their row is inserted: signup draws one into the insert itself,
-- and the migration before this one filled the rows that predate the column. the constraint records that, so
-- a nameless row can no longer be written at all.
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username_normalized" SET NOT NULL;
