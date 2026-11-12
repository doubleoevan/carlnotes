SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "images_filter_version" integer DEFAULT 0 NOT NULL;
