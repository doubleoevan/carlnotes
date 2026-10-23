-- every pending migration runs in one transaction, so the lock timeout bounds how long each table's lock waits behind a
-- long query, and a deploy that cannot get one in time fails fast. if not exists skips an index built concurrently by
-- hand before the deploy, which keeps a large table writable while it builds
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_resource_id_idx" ON "findings" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resources_title_or_url_lower_trgm" ON "resources" USING gin (lower(coalesce("title", "url")) gin_trgm_ops);
