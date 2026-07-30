CREATE TABLE "bookmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"finding_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmarks_user_finding_unique" UNIQUE("user_id","finding_id")
);
--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "engagement" integer;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "max_results" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_max_results_allowed" CHECK (max_results in (5, 10, 15, 20));