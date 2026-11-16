SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "topic_memories" ALTER COLUMN "fact_date" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "topic_memories" ADD CONSTRAINT "topic_memories_fact_date_precision" CHECK ("topic_memories"."fact_date" ~ '^[0-9]{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?$');