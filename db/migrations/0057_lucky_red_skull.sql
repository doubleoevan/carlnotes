ALTER TABLE "teams" DROP CONSTRAINT "teams_handle_id_handles_id_fk";
--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "handle_id";--> statement-breakpoint
DELETE FROM "handles" WHERE "owner_type" = 'team';--> statement-breakpoint
ALTER TABLE "handles" DROP COLUMN "owner_type";--> statement-breakpoint
ALTER TABLE "handles" DROP COLUMN "released_at";--> statement-breakpoint
DROP TYPE "public"."handle_owner_type";
