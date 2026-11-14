SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "daily_play_counts" ADD COLUMN "postal_code" text, ADD COLUMN "metro_code" text;--> statement-breakpoint
ALTER TABLE "daily_view_counts" ADD COLUMN "postal_code" text, ADD COLUMN "metro_code" text;
