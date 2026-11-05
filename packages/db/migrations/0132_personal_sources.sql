CREATE TABLE "agent_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret_digest" text NOT NULL,
	"label" text NOT NULL,
	"last_four" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finding_personal_annotations" (
	"finding_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"user_id" text NOT NULL,
	"encrypted_text" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finding_personal_annotations_finding_id_user_id_pk" PRIMARY KEY("finding_id","user_id"),
	CONSTRAINT "finding_personal_annotations_ciphertext" CHECK ("finding_personal_annotations"."encrypted_text" like 'enc1:%')
);
--> statement-breakpoint
CREATE TABLE "personal_source_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"user_id" text NOT NULL,
	"origin" text NOT NULL,
	"encrypted_payload" text NOT NULL,
	"omitted_link_count" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"distilled_at" timestamp with time zone,
	CONSTRAINT "personal_source_entries_ciphertext" CHECK ("personal_source_entries"."encrypted_payload" like 'enc1:%'),
	CONSTRAINT "personal_source_entries_retention" CHECK (("personal_source_entries"."origin" = 'import' and "personal_source_entries"."expires_at" is null) or ("personal_source_entries"."origin" in ('send', 'email') and "personal_source_entries"."expires_at" is not null and "personal_source_entries"."expires_at" = "personal_source_entries"."received_at" + interval '720 hours')),
	CONSTRAINT "personal_source_entries_omissions_valid" CHECK ("personal_source_entries"."omitted_link_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "personal_source_daily_counts" (
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"kind" text NOT NULL,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "personal_source_daily_counts_user_id_day_kind_pk" PRIMARY KEY("user_id","day","kind"),
	CONSTRAINT "personal_source_daily_counts_valid" CHECK ("personal_source_daily_counts"."accepted_count" >= 0 and "personal_source_daily_counts"."kind" in ('send', 'email'))
);
--> statement-breakpoint
CREATE TABLE "personal_source_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"sender_identity" text NOT NULL,
	"request_id" text NOT NULL,
	"payload_digest" text NOT NULL,
	"entry_id" text NOT NULL,
	"queued_link_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_source_distillation_spends" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"topic_id" text,
	"revision" integer NOT NULL,
	"cost" double precision DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'started' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "personal_source_distillation_spends_nonnegative" CHECK ("personal_source_distillation_spends"."cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "personal_source_email_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"email_id" text NOT NULL,
	"user_id" text,
	"sender_digest" text,
	"outcome" text,
	"reply_started_at" timestamp with time zone,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_source_email_replies" (
	"receipt_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entry_id" text,
	"encrypted_payload" text NOT NULL,
	CONSTRAINT "personal_source_email_replies_ciphertext" CHECK ("personal_source_email_replies"."encrypted_payload" like 'enc1:%')
);
--> statement-breakpoint
CREATE TABLE "personal_source_legacy_outputs" (
	"topic_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"reference_id" text NOT NULL,
	"encrypted_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_source_legacy_outputs_user_id_kind_reference_id_pk" PRIMARY KEY("user_id","kind","reference_id"),
	CONSTRAINT "personal_source_legacy_outputs_ciphertext" CHECK ("personal_source_legacy_outputs"."encrypted_text" like 'enc1:%')
);
--> statement-breakpoint
CREATE TABLE "personal_source_links" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"position" integer NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"scan_id" text,
	"claim_expires_at" timestamp with time zone,
	"considered_at" timestamp with time zone,
	"review_outcome" text,
	"review_reason" text,
	CONSTRAINT "personal_source_links_position_valid" CHECK ("personal_source_links"."position" >= 0 and "personal_source_links"."position" < 100),
	CONSTRAINT "personal_source_links_state_valid" CHECK ("personal_source_links"."state" in ('pending', 'claimed', 'considered'))
);
--> statement-breakpoint
CREATE TABLE "topic_personal_source_contexts" (
	"topic_id" text NOT NULL,
	"user_id" text NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"public_outputs_version" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"processed_revision" integer DEFAULT 0 NOT NULL,
	"encrypted_context" text,
	"state" text DEFAULT 'empty' NOT NULL,
	"has_incomplete_coverage" boolean DEFAULT false NOT NULL,
	"included_entry_count" integer DEFAULT 0 NOT NULL,
	"earliest_expiry" timestamp with time zone,
	"dirty_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_personal_source_contexts_topic_id_user_id_pk" PRIMARY KEY("topic_id","user_id"),
	CONSTRAINT "topic_personal_source_contexts_topic_user_unique" UNIQUE("topic_id","user_id"),
	CONSTRAINT "topic_personal_source_contexts_revision_valid" CHECK ("topic_personal_source_contexts"."processed_revision" >= 0 and "topic_personal_source_contexts"."revision" >= "topic_personal_source_contexts"."processed_revision"),
	CONSTRAINT "topic_personal_source_contexts_ciphertext" CHECK ("topic_personal_source_contexts"."encrypted_context" is null or "topic_personal_source_contexts"."encrypted_context" like 'enc1:%')
);
--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "personal_source_bonus_weight" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_api_keys" ADD CONSTRAINT "agent_api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_personal_annotations" ADD CONSTRAINT "finding_personal_annotations_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_personal_annotations" ADD CONSTRAINT "finding_personal_annotations_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_personal_annotations" ADD CONSTRAINT "finding_personal_annotations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_entries" ADD CONSTRAINT "personal_source_entries_source_id_topic_id_user_id_sources_id_topic_id_personal_source_user_id_fk" FOREIGN KEY ("source_id","topic_id","user_id") REFERENCES "public"."sources"("id","topic_id","personal_source_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_entries" ADD CONSTRAINT "personal_source_entries_topic_id_user_id_topic_personal_source_contexts_topic_id_user_id_fk" FOREIGN KEY ("topic_id","user_id") REFERENCES "public"."topic_personal_source_contexts"("topic_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_daily_counts" ADD CONSTRAINT "personal_source_daily_counts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_deliveries" ADD CONSTRAINT "personal_source_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_deliveries" ADD CONSTRAINT "personal_source_deliveries_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_distillation_spends" ADD CONSTRAINT "personal_source_distillation_spends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_distillation_spends" ADD CONSTRAINT "personal_source_distillation_spends_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_email_receipts" ADD CONSTRAINT "personal_source_email_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_email_replies" ADD CONSTRAINT "personal_source_email_replies_receipt_id_personal_source_email_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."personal_source_email_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_email_replies" ADD CONSTRAINT "personal_source_email_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_email_replies" ADD CONSTRAINT "personal_source_email_replies_entry_id_personal_source_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."personal_source_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_legacy_outputs" ADD CONSTRAINT "personal_source_legacy_outputs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_legacy_outputs" ADD CONSTRAINT "personal_source_legacy_outputs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_links" ADD CONSTRAINT "personal_source_links_entry_id_personal_source_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."personal_source_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_source_links" ADD CONSTRAINT "personal_source_links_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_personal_source_contexts" ADD CONSTRAINT "topic_personal_source_contexts_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_personal_source_contexts" ADD CONSTRAINT "topic_personal_source_contexts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_api_keys_user_idx" ON "agent_api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "finding_personal_annotations_sender_idx" ON "finding_personal_annotations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "personal_source_entries_topic_received_idx" ON "personal_source_entries" USING btree ("topic_id","received_at","id");--> statement-breakpoint
CREATE INDEX "personal_source_entries_sender_received_idx" ON "personal_source_entries" USING btree ("topic_id","user_id","received_at","id");--> statement-breakpoint
CREATE INDEX "personal_source_entries_source_received_idx" ON "personal_source_entries" USING btree ("source_id","received_at");--> statement-breakpoint
CREATE INDEX "personal_source_entries_expiry_idx" ON "personal_source_entries" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_source_deliveries_sender_request_unique" ON "personal_source_deliveries" USING btree ("user_id","sender_identity","request_id");--> statement-breakpoint
CREATE INDEX "personal_source_distillation_spends_user_created_idx" ON "personal_source_distillation_spends" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_source_email_receipts_email_unique" ON "personal_source_email_receipts" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "personal_source_email_receipts_pending_idx" ON "personal_source_email_receipts" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_source_links_entry_fingerprint_unique" ON "personal_source_links" USING btree ("entry_id","fingerprint");--> statement-breakpoint
CREATE INDEX "personal_source_links_scan_idx" ON "personal_source_links" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "topic_personal_source_contexts_dirty_idx" ON "topic_personal_source_contexts" USING btree ("dirty_since");--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_personal_source_bonus_weight" CHECK ("findings"."personal_source_bonus_weight" in (0, 0.5, 1));