SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE INDEX "room_mentions_unseen_user_id_idx" ON "room_mentions" USING btree ("user_id") WHERE "room_mentions"."seen_at" is null;
