ALTER TYPE "public"."episode_status" RENAME VALUE 'rendering' TO 'recording';--> statement-breakpoint
ALTER TABLE "episodes" ALTER COLUMN "status" SET DEFAULT 'recording';
