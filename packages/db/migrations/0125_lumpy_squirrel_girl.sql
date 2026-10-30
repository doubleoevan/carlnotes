-- the column add takes a brief exclusive lock on resources, so the lock timeout keeps it from queueing every read and
-- write behind a long query, and a deploy that cannot get the lock in time fails fast
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "is_unsafe" boolean DEFAULT false NOT NULL;