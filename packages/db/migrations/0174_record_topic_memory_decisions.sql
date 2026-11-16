SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TABLE "topic_memory_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_id" text NOT NULL,
	"memory_id" text NOT NULL,
	"candidate_memory_id" text,
	"match_memory_id" text,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"cosine" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topic_memory_decisions" ADD CONSTRAINT "topic_memory_decisions_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_memory_decisions" ADD CONSTRAINT "topic_memory_decisions_memory_id_topic_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."topic_memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_memory_decisions" ADD CONSTRAINT "topic_memory_decisions_candidate_memory_id_topic_memories_id_fk" FOREIGN KEY ("candidate_memory_id") REFERENCES "public"."topic_memories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_memory_decisions" ADD CONSTRAINT "topic_memory_decisions_match_memory_id_topic_memories_id_fk" FOREIGN KEY ("match_memory_id") REFERENCES "public"."topic_memories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_memory_decisions_scan_idx" ON "topic_memory_decisions" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "topic_memory_decisions_memory_idx" ON "topic_memory_decisions" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "topic_memory_decisions_candidate_idx" ON "topic_memory_decisions" USING btree ("candidate_memory_id");--> statement-breakpoint
CREATE INDEX "topic_memory_decisions_match_idx" ON "topic_memory_decisions" USING btree ("match_memory_id");
