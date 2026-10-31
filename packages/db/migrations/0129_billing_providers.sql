SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TYPE "public"."billing_provider" AS ENUM('stripe', 'app_store', 'play_store');--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD COLUMN "provider" "billing_provider" DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "revenuecat_app_user_id" text DEFAULT gen_random_uuid()::text NOT NULL, ADD CONSTRAINT "users_revenuecat_app_user_id_unique" UNIQUE("revenuecat_app_user_id");