ALTER TABLE "findings" RENAME COLUMN "signal_score" TO "relevance_score";--> statement-breakpoint
ALTER TABLE "findings" RENAME COLUMN "why_summary" TO "relevance_explanation";--> statement-breakpoint
ALTER TABLE "scans" RENAME COLUMN "ai_summary" TO "scan_summary";