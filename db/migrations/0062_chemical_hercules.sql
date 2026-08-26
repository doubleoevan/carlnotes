CREATE TABLE "docs_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"page" text NOT NULL,
	"heading" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"embedding_model" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "docs_chunks_page_heading_unique" UNIQUE("page","heading")
);
