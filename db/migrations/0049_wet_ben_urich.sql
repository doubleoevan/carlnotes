CREATE TYPE "public"."handle_owner_type" AS ENUM('user', 'team');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('lead', 'member');--> statement-breakpoint
CREATE TABLE "handles" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"slug_normalized" text NOT NULL,
	"owner_type" "handle_owner_type" NOT NULL,
	"owner_id" text NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "handles" ("id", "slug", "slug_normalized", "owner_type", "owner_id")
SELECT gen_random_uuid()::text, "username", "username_normalized", 'user', "id" FROM "users";--> statement-breakpoint
DROP INDEX "users_username_normalized_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "handles_slug_normalized_unique" ON "handles" USING btree ("slug_normalized");