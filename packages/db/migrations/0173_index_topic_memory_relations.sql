SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE INDEX "topic_memories_replaced_by_idx" ON "topic_memories" USING btree ("replaced_by_id");--> statement-breakpoint
CREATE INDEX "topic_memories_review_match_idx" ON "topic_memories" USING btree ("review_match_id");--> statement-breakpoint
CREATE INDEX "topic_memories_first_scan_idx" ON "topic_memories" USING btree ("first_scan_id");--> statement-breakpoint
CREATE INDEX "topic_memories_last_seen_scan_idx" ON "topic_memories" USING btree ("last_seen_scan_id");--> statement-breakpoint
CREATE INDEX "topic_memory_feedback_user_idx" ON "topic_memory_feedback" USING btree ("user_id");