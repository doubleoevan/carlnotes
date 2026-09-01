CREATE TABLE "releases" (
	"id" text PRIMARY KEY NOT NULL,
	"tag" text NOT NULL,
	"name" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"released_at" timestamp with time zone NOT NULL,
	"html_url" text NOT NULL,
	"is_prerelease" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "releases_tag_unique" UNIQUE("tag")
);
