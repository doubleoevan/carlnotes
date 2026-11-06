SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
ALTER TABLE "personal_source_email_receipts" RENAME TO "personal_source_email_confirmations";
--> statement-breakpoint
ALTER TABLE "personal_source_email_choices" RENAME COLUMN "receipt_id" TO "confirmation_id";
--> statement-breakpoint
ALTER TABLE "personal_source_email_replies" RENAME COLUMN "receipt_id" TO "confirmation_id";
--> statement-breakpoint
ALTER TABLE "personal_source_email_choices" RENAME CONSTRAINT "personal_source_email_choices_receipt_id_personal_source_email_receipts_id_fk" TO "personal_source_email_choices_confirmation_id_personal_source_email_confirmations_id_fk";
--> statement-breakpoint
ALTER TABLE "personal_source_email_confirmations" RENAME CONSTRAINT "personal_source_email_receipts_user_id_users_id_fk" TO "personal_source_email_confirmations_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "personal_source_email_replies" RENAME CONSTRAINT "personal_source_email_replies_receipt_id_personal_source_email_receipts_id_fk" TO "personal_source_email_replies_confirmation_id_personal_source_email_confirmations_id_fk";
--> statement-breakpoint
ALTER INDEX "personal_source_email_receipts_pkey" RENAME TO "personal_source_email_confirmations_pkey";
--> statement-breakpoint
ALTER INDEX "personal_source_email_receipts_email_unique" RENAME TO "personal_source_email_confirmations_email_unique";
--> statement-breakpoint
ALTER INDEX "personal_source_email_receipts_pending_idx" RENAME TO "personal_source_email_confirmations_pending_idx";