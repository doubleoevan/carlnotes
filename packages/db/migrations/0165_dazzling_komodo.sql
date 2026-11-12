SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TABLE "spend_control_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"podcast_episodes_cutoff_cents" integer,
	"scheduled_scans_cutoff_cents" integer,
	"chat_cutoff_cents" integer,
	"first_scan_dispatch_limit" integer,
	"hourly_signup_alert_count" integer,
	"is_unverified_first_scan_limit_on" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" text,
	CONSTRAINT "spend_control_settings_single_row" CHECK ("spend_control_settings"."id" = 1),
	CONSTRAINT "spend_control_settings_values" CHECK (coalesce("spend_control_settings"."podcast_episodes_cutoff_cents", 1) > 0 and coalesce("spend_control_settings"."scheduled_scans_cutoff_cents", 1) > 0 and coalesce("spend_control_settings"."chat_cutoff_cents", 1) > 0 and coalesce("spend_control_settings"."first_scan_dispatch_limit", 0) >= 0 and coalesce("spend_control_settings"."hourly_signup_alert_count", 1) >= 1)
);
--> statement-breakpoint
ALTER TABLE "spend_control_settings" ADD CONSTRAINT "spend_control_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;