CREATE INDEX "attachments_topic_id_idx" ON "attachments" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "findings_topic_relevance_idx" ON "findings" USING btree ("topic_id","relevance_score" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "findings_scan_id_idx" ON "findings" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "sources_topic_id_idx" ON "sources" USING btree ("topic_id");