CREATE TABLE "note_reads" (
	"note_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_reads_note_id_user_id_pk" PRIMARY KEY("note_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "last_editor_user_id" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "body_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "note_reads" ADD CONSTRAINT "note_reads_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_reads" ADD CONSTRAINT "note_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_reads_user_id_idx" ON "note_reads" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_last_editor_user_id_users_id_fk" FOREIGN KEY ("last_editor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;