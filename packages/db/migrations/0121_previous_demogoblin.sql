-- every pending migration runs in one transaction, so the lock timeout bounds how long the topic_email_sends lock waits
-- behind a long query, and a deploy that cannot get it in time fails fast. if not exists skips an index built
-- concurrently by hand before the deploy, which keeps the table writable while it builds
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_email_sends_topic_recipient_sent_idx" ON "topic_email_sends" USING btree ("topic_id","recipient_user_id","sent_at");