ALTER TABLE "chat_attachments" ADD COLUMN "chat_turn_id" text;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD COLUMN "is_kept" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_chat_turn_id_chat_turns_id_fk" FOREIGN KEY ("chat_turn_id") REFERENCES "public"."chat_turns"("id") ON DELETE set null ON UPDATE no action;