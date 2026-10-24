-- every pending migration runs in one transaction, so the lock timeout bounds how long the accounts lock waits behind a
-- long query, and a deploy that cannot get it in time fails fast. if not exists skips an index built concurrently by hand
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_provider_id_account_id_idx" ON "accounts" USING btree ("provider_id","account_id");