SET LOCAL lock_timeout = '3s';--> statement-breakpoint
-- the previous release no longer reads admin_plan_changes.reason or ends_at once the plan select without a dialog is
-- live. deployed with it, the release before that fails its admin users page and plan changes until its last instance
-- stops
ALTER TABLE "admin_plan_changes" DROP COLUMN "reason", DROP COLUMN "ends_at";
