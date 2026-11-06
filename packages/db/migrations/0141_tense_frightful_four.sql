SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE INDEX "bookmarks_finding_id_idx" ON "bookmarks" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "consumptions_finding_id_idx" ON "consumptions" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "finding_feedback_finding_id_idx" ON "finding_feedback" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "finding_views_finding_id_idx" ON "finding_views" USING btree ("finding_id");