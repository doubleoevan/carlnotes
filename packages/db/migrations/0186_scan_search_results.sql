SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TABLE "scan_search_results" (
	"scan_id" text PRIMARY KEY NOT NULL,
	"result" jsonb
);
--> statement-breakpoint
ALTER TABLE "scan_search_results" ADD CONSTRAINT "scan_search_results_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;