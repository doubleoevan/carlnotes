SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE INDEX "push_notification_sends_push_device_id_idx" ON "push_notification_sends" USING btree ("push_device_id") WHERE "push_notification_sends"."push_device_id" is not null;--> statement-breakpoint
CREATE INDEX "push_notification_sends_recipient_user_id_idx" ON "push_notification_sends" USING btree ("recipient_user_id");