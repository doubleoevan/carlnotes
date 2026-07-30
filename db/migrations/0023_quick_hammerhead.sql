ALTER TABLE "subscriptions" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "is_email_enabled" boolean DEFAULT true NOT NULL;