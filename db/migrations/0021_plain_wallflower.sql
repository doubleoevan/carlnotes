CREATE TABLE "billing_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"plan" "plan" NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"has_payment_method" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "budget_override_cents" integer;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;