CREATE TABLE "finding_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"finding_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"user_id" text NOT NULL,
	"feedback" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finding_views" (
	"id" text PRIMARY KEY NOT NULL,
	"finding_id" text NOT NULL,
	"user_id" text NOT NULL,
	"opened_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"dwell_ms" integer
);
--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "rated_by_user_id" text;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "rated_team_id" text;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "rated_role" text;--> statement-breakpoint
ALTER TABLE "finding_feedback" ADD CONSTRAINT "finding_feedback_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_feedback" ADD CONSTRAINT "finding_feedback_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_feedback" ADD CONSTRAINT "finding_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_views" ADD CONSTRAINT "finding_views_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_views" ADD CONSTRAINT "finding_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;