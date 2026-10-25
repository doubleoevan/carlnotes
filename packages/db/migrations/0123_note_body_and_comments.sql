-- every note goes first, by decision: nothing in the old bodies or threads is kept, and the column rewrites below run
-- on empty tables
DELETE FROM "notes";--> statement-breakpoint
ALTER TABLE "note_comment_threads" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "note_comment_threads" CASCADE;--> statement-breakpoint
DROP INDEX "note_comments_thread_id_idx";--> statement-breakpoint
ALTER TABLE "note_comments" ALTER COLUMN "body" SET DATA TYPE text USING "body"::text;--> statement-breakpoint
ALTER TABLE "note_comments" ALTER COLUMN "body" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "note_comments" ADD COLUMN "note_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "note_comments" ADD CONSTRAINT "note_comments_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_comments_note_id_created_at_idx" ON "note_comments" USING btree ("note_id","created_at");--> statement-breakpoint
ALTER TABLE "note_comments" DROP COLUMN "thread_id";--> statement-breakpoint
ALTER TABLE "note_comments" DROP COLUMN "deleted_at";--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN "ydoc";