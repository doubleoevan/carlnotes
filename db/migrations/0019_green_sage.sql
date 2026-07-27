ALTER TABLE "resources" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "last_modified" text;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "reused" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "revalidated" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "fetched" integer DEFAULT 0 NOT NULL;