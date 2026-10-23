-- every pending migration runs in one transaction, so the lock timeout bounds how long the scans lock waits behind a
-- long query, and a deploy that cannot get it in time fails fast
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "source_results" jsonb;
