CREATE TABLE "consumptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"finding_id" text NOT NULL,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consumptions_user_finding_unique" UNIQUE("user_id","finding_id")
);
--> statement-breakpoint
ALTER TABLE "consumptions" ADD CONSTRAINT "consumptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumptions" ADD CONSTRAINT "consumptions_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;