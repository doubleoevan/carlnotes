CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "teams_name_lower_trgm" ON "teams" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "topics_name_lower_trgm" ON "topics" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_username_normalized_trgm" ON "users" USING gin ("username_normalized" gin_trgm_ops);