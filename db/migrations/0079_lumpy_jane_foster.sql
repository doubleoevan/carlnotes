ALTER TYPE "public"."note_scope" RENAME TO "note_visibility";--> statement-breakpoint
ALTER TABLE "note_threads" RENAME TO "note_comment_threads";--> statement-breakpoint
ALTER TABLE "notes" RENAME COLUMN "scope" TO "visibility";--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT "notes_one_subject";--> statement-breakpoint
ALTER TABLE "note_comments" DROP CONSTRAINT "note_comments_thread_id_note_threads_id_fk";
--> statement-breakpoint
ALTER TABLE "note_comment_threads" DROP CONSTRAINT "note_threads_note_id_notes_id_fk";
--> statement-breakpoint
DROP INDEX "note_threads_note_id_idx";--> statement-breakpoint
ALTER TABLE "note_comments" ADD CONSTRAINT "note_comments_thread_id_note_comment_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."note_comment_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_comment_threads" ADD CONSTRAINT "note_comment_threads_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_comment_threads_note_id_idx" ON "note_comment_threads" USING btree ("note_id");--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_one_page" CHECK (("notes"."topic_id" is null) <> ("notes"."team_id" is null));