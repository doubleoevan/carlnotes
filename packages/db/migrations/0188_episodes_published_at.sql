SET LOCAL lock_timeout = '3s';--> statement-breakpoint
-- the home's reads of the week's new podcast episodes and films read the published rows newest first. if not exists
-- skips the index built concurrently by hand before the deploy, which keeps the table writable while it builds
CREATE INDEX IF NOT EXISTS "episodes_published_at_idx" ON "episodes" USING btree ("published_at" DESC NULLS LAST) WHERE "episodes"."status" = 'published';
