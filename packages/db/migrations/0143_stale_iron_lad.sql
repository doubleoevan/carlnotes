SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
ALTER TABLE "claims" RENAME TO "job_leases";
--> statement-breakpoint
ALTER INDEX "claims_pkey" RENAME TO "job_leases_pkey";