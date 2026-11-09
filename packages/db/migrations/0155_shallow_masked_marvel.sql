SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE INDEX "episodes_feature_order_idx" ON "episodes" USING btree ("feature_order") WHERE "episodes"."feature_order" is not null;--> statement-breakpoint
CREATE INDEX "topics_feature_order_idx" ON "topics" USING btree ("feature_order") WHERE "topics"."feature_order" is not null;