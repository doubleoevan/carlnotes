-- uniqueness moves from lower(username) to a stored comparison form, so slow-roasted and SlowRoasted
-- cannot both be registered. the app computes it, because Postgres has no NFKC to do it in an index expression
ALTER TABLE "users" ADD COLUMN "username_normalized" text;--> statement-breakpoint
-- the usernames already assigned are ascii, so stripping separators and lowercasing reproduces the app's form exactly
UPDATE "users" SET "username_normalized" = lower(regexp_replace("username", '[-_]', '', 'g')) WHERE "username" IS NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "users_username_lower_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_normalized_unique" ON "users" USING btree ("username_normalized");--> statement-breakpoint
-- a username a user used to hold, so an old link still resolves and the name is not immediately reclaimable
CREATE TABLE "username_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"username_normalized" text NOT NULL,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "username_history" ADD CONSTRAINT "username_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "username_history_normalized_idx" ON "username_history" USING btree ("username_normalized");
