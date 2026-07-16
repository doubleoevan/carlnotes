ALTER TABLE "topics" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "topics_tags_gin" ON "topics" USING gin ("tags");