CREATE TABLE "pending_object_deletions" (
	"object_key" text PRIMARY KEY NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_try_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"reported_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "pending_object_deletions_next_try_at_idx" ON "pending_object_deletions" USING btree ("next_try_at");