CREATE TABLE "link_previews" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"description" text,
	"image_object_key" text,
	"image_content_type" text,
	"status" "attachment_status" NOT NULL,
	"fetched_by_team_id" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "link_previews_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "link_previews" ADD CONSTRAINT "link_previews_fetched_by_team_id_teams_id_fk" FOREIGN KEY ("fetched_by_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "link_previews_team_fetched_idx" ON "link_previews" USING btree ("fetched_by_team_id","fetched_at");