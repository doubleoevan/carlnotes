CREATE TYPE "public"."avatar_source" AS ENUM('generated', 'oauth', 'upload');--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "subscriber_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "handle_changed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_source" "avatar_source" DEFAULT 'generated' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_lower_unique" ON "users" USING btree (lower("handle"));--> statement-breakpoint
-- backfill the denormalised count, or every topic that already has subscribers reads zero.
-- the union counts a person once whether they subscribed directly, inherited through an audience, or both,
-- and the owner's own row is excluded the same way every other read of this count excludes it
UPDATE "topics" SET "subscriber_count" = (
	SELECT count(*) FROM (
		SELECT "subscriptions"."subscriber_user_id" AS "subscriber_id"
			FROM "subscriptions"
			WHERE "subscriptions"."topic_id" = "topics"."id"
				AND "subscriptions"."is_active"
				AND "subscriptions"."subscriber_user_id" IS NOT NULL
		UNION
		SELECT "audience_members"."user_id" AS "subscriber_id"
			FROM "subscriptions"
			JOIN "audience_members" ON "audience_members"."audience_id" = "subscriptions"."subscriber_audience_id"
			WHERE "subscriptions"."topic_id" = "topics"."id"
				AND "subscriptions"."is_active"
	) AS "effective_subscribers"
	WHERE "subscriber_id" <> "topics"."owner_id"
);