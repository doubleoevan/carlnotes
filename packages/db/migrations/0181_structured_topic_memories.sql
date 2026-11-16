SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "topic_memories" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "topic_memories" ADD COLUMN "claim_type" text;--> statement-breakpoint
ALTER TABLE "topic_memories" ADD COLUMN "value" text;--> statement-breakpoint
ALTER TABLE "topic_memory_decisions" ADD COLUMN "candidate_text" text;--> statement-breakpoint
ALTER TABLE "topic_memory_decisions" ADD COLUMN "match_text" text;--> statement-breakpoint
CREATE INDEX "topic_memories_exact_claim_idx" ON "topic_memories" USING btree ("topic_id","subject","claim_type","fact_date");