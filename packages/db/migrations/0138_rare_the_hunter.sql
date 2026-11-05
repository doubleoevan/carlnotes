CREATE TABLE "personal_source_email_choices" (
	"receipt_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"encrypted_topics" text NOT NULL,
	"message_id" text NOT NULL,
	CONSTRAINT "personal_source_email_choices_ciphertext" CHECK ("personal_source_email_choices"."encrypted_topics" like 'enc1:%')
);
--> statement-breakpoint
ALTER TABLE "personal_source_email_choices" ADD CONSTRAINT "personal_source_email_choices_receipt_id_personal_source_email_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."personal_source_email_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_email_choices" ADD CONSTRAINT "personal_source_email_choices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_source_email_choices_message_idx" ON "personal_source_email_choices" USING btree ("user_id","message_id");