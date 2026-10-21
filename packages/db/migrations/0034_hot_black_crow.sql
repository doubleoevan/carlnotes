CREATE TYPE "public"."billing_interval" AS ENUM('monthly', 'yearly');--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD COLUMN "interval" "billing_interval" DEFAULT 'monthly' NOT NULL;