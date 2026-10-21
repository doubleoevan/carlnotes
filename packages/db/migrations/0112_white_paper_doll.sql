ALTER TABLE "findings" ADD COLUMN "found_scan_id" text;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_found_scan_id_scans_id_fk" FOREIGN KEY ("found_scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "findings_found_scan_id_idx" ON "findings" USING btree ("found_scan_id");--> statement-breakpoint
-- every finding that predates the column was first found by the scan that last reviewed it, as far as the row knows
UPDATE "findings" SET "found_scan_id" = "scan_id" WHERE "found_scan_id" IS NULL;
