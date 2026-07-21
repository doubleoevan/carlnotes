ALTER TABLE "findings" ADD COLUMN "view_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "fetched_at" timestamp with time zone DEFAULT now() NOT NULL;