CREATE TYPE "public"."day_of_week" AS ENUM('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday');--> statement-breakpoint
ALTER TYPE "public"."frequency" ADD VALUE 'weekdays' BEFORE 'weekly';--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "scheduled_time" time DEFAULT '09:00:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "scheduled_day_of_week" "day_of_week" DEFAULT 'monday' NOT NULL;