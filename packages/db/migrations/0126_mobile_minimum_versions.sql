SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TABLE "mobile_minimum_versions" (
	"platform" text PRIMARY KEY NOT NULL,
	"minimum_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" text,
	CONSTRAINT "mobile_minimum_versions_platform_check" CHECK ("mobile_minimum_versions"."platform" in ('ios', 'android'))
);
--> statement-breakpoint
ALTER TABLE "mobile_minimum_versions" ADD CONSTRAINT "mobile_minimum_versions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;