CREATE INDEX "chat_turns_user_created_idx" ON "chat_turns" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "finding_views_user_finding_idx" ON "finding_views" USING btree ("user_id","finding_id");--> statement-breakpoint
CREATE INDEX "invites_invited_by_invited_at_idx" ON "invites" USING btree ("invited_by_user_id","invited_at");--> statement-breakpoint
CREATE INDEX "invites_invited_user_id_idx" ON "invites" USING btree ("invited_user_id");--> statement-breakpoint
CREATE INDEX "invites_email_idx" ON "invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "scans_topic_started_idx" ON "scans" USING btree ("topic_id","started_at");--> statement-breakpoint
CREATE INDEX "scans_owner_started_idx" ON "scans" USING btree ("owner_id","started_at");--> statement-breakpoint
CREATE INDEX "subscriptions_subscriber_active_idx" ON "subscriptions" USING btree ("subscriber_user_id","is_active");--> statement-breakpoint
CREATE INDEX "team_members_user_id_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "topics_owner_id_idx" ON "topics" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "topics_team_id_idx" ON "topics" USING btree ("team_id");