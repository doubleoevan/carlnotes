ALTER TABLE "handles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "handles" CASCADE;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_normalized_unique" ON "users" USING btree ("username_normalized");