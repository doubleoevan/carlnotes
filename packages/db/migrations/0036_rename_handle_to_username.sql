-- rename the handle columns to username. the concept is the same, the word is the one the product uses.
-- a rename rather than a drop and re-add, so the usernames already backfilled onto existing rows survive
ALTER TABLE "users" RENAME COLUMN "handle" TO "username";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "handle_changed" TO "username_changed";--> statement-breakpoint
ALTER INDEX "users_handle_lower_unique" RENAME TO "users_username_lower_unique";
