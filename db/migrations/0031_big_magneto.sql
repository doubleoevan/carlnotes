ALTER TABLE "scans" ADD COLUMN "dispatched_at" timestamp with time zone;--> statement-breakpoint
-- a Scan that already reached a terminal status was dispatched, whatever it can prove. stamping them keeps the
-- relay from mistaking finished history for Scans still waiting to start. rows still running stay null: the
-- relay tries them, and a Scan that really is running refuses the duplicate and records its own marker
UPDATE "scans" SET "dispatched_at" = "started_at" WHERE "status" <> 'running';
