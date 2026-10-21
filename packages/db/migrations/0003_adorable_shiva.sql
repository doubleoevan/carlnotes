ALTER TABLE "resources" ADD COLUMN "snippet" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "stage_costs" jsonb DEFAULT '{}'::jsonb NOT NULL;