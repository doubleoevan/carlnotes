SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TYPE "public"."report_resolution" AS ENUM('removed', 'kept');--> statement-breakpoint
CREATE TYPE "public"."report_subject_kind" AS ENUM('topic', 'profile', 'team', 'chatMessage', 'note', 'noteComment');--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_kind" "report_subject_kind" NOT NULL,
	"subject_id" text NOT NULL,
	"subject_author_user_id" text,
	"reporter_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"subject_text" text NOT NULL,
	"subject_path" text NOT NULL,
	"reminded_at" timestamp with time zone,
	"resolution" "report_resolution",
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_user_id" text NOT NULL,
	"blocked_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_user_id_blocked_user_id_pk" PRIMARY KEY("blocker_user_id","blocked_user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_version" text, ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_subject_author_user_id_users_id_fk" FOREIGN KEY ("subject_author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_reporter_subject_unique" ON "reports" USING btree ("reporter_user_id","subject_kind","subject_id");--> statement-breakpoint
CREATE INDEX "reports_open_created_at_idx" ON "reports" USING btree ("created_at") WHERE "reports"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "reports_subject_idx" ON "reports" USING btree ("subject_kind","subject_id");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_user_id_idx" ON "user_blocks" USING btree ("blocked_user_id");