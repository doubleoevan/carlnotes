CREATE TABLE "personal_source_email_approvals" (
	"receipt_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sender_digest" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"encrypted_payload" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_source_email_approvals_ciphertext" CHECK (("personal_source_email_approvals"."state" = 'pending' and "personal_source_email_approvals"."encrypted_payload" is not null and "personal_source_email_approvals"."encrypted_payload" like 'enc1:%') or ("personal_source_email_approvals"."state" in ('approved', 'cancelled') and "personal_source_email_approvals"."encrypted_payload" is null))
);
--> statement-breakpoint
ALTER TABLE "personal_source_email_approvals" ADD CONSTRAINT "personal_source_email_approvals_receipt_id_personal_source_email_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."personal_source_email_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_email_approvals" ADD CONSTRAINT "personal_source_email_approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_source_email_approvals_user_state_idx" ON "personal_source_email_approvals" USING btree ("user_id","state");