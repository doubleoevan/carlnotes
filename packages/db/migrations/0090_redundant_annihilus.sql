CREATE TABLE "favicons" (
	"host" text PRIMARY KEY NOT NULL,
	"object_key" text,
	"content_type" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
