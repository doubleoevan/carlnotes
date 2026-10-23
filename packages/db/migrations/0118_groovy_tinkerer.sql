-- every pending migration runs in one transaction, so the lock timeout bounds how long the room_attachments lock waits
-- behind a long query, and a deploy that cannot get it in time fails fast
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE INDEX "room_attachments_team_id_idx" ON "room_attachments" USING btree ("team_id","topic_id");