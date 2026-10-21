DO $$ BEGIN
	CREATE TYPE "public"."plan" AS ENUM('free', 'plus', 'pro');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan" "plan" DEFAULT 'free' NOT NULL;