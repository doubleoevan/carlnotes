SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TABLE "topic_memory_subject_aliases" (
	"topic_id" text NOT NULL,
	"alias_key" text NOT NULL,
	"alias_name" text NOT NULL,
	"canonical_key" text NOT NULL,
	"canonical_name" text NOT NULL,
	"person" jsonb,
	"finding_id" text,
	CONSTRAINT "topic_memory_subject_aliases_topic_id_alias_key_pk" PRIMARY KEY("topic_id","alias_key")
);
--> statement-breakpoint
ALTER TABLE "topic_memory_subject_aliases" ADD CONSTRAINT "topic_memory_subject_aliases_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_memory_subject_aliases" ADD CONSTRAINT "topic_memory_subject_aliases_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_memory_subject_aliases_finding_idx" ON "topic_memory_subject_aliases" USING btree ("finding_id");