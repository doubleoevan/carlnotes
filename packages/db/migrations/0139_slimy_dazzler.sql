-- Keep scores and every retained item unchanged while storing actual source bonuses.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
ALTER TABLE "findings" RENAME COLUMN "personal_source_bonus_weight" TO "personal_source_score_bonus";
--> statement-breakpoint
ALTER TABLE "findings"
  DROP CONSTRAINT "findings_personal_source_bonus_weight",
  ALTER COLUMN "personal_source_score_bonus" TYPE real USING ("personal_source_score_bonus" / 10::real),
  ADD CONSTRAINT "findings_personal_source_score_bonus" CHECK ("personal_source_score_bonus" IN (0::real, 0.05::real, 0.1::real));
