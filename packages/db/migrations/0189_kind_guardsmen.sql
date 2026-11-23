SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TYPE "public"."billing_provider" ADD VALUE 'admin';--> statement-breakpoint
CREATE TABLE "admin_plan_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"admin_user_id" text,
	"plan" "plan" NOT NULL,
	"reason" text NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_plan_changes" ADD CONSTRAINT "admin_plan_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_plan_changes" ADD CONSTRAINT "admin_plan_changes_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_plan_changes_user_id_idx" ON "admin_plan_changes" USING btree ("user_id");
