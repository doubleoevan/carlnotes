SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "admin_plan_changes" ALTER COLUMN "reason" DROP NOT NULL;
