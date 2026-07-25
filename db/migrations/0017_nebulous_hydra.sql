-- null every embedding first: stored 768-wide vectors cannot cast to vector(1024) in place. the backfill re-embeds them at 1024
UPDATE "resources" SET "embedding" = NULL, "embedding_model" = NULL;--> statement-breakpoint
ALTER TABLE "resources" ALTER COLUMN "embedding" SET DATA TYPE vector(1024);
