DROP TABLE "team_join_requests" CASCADE;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;