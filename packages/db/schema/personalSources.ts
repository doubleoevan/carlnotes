// encrypted received content and durable metadata for its private lifecycle
import { sql } from "drizzle-orm"
import {
	boolean,
	check,
	doublePrecision,
	foreignKey,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core"
import { primaryId, timestamps } from "./columns"
import { findings, scans } from "./scans"
import { sources, topics } from "./topics"
import { users } from "./users"

// each sender keeps one private context per Topic
export const topicPersonalSourceContexts = pgTable(
	"topic_personal_source_contexts",
	{
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		activatedAt: timestamp("activated_at", { withTimezone: true }).defaultNow().notNull(),
		publicOutputsVersion: integer("public_outputs_version").notNull().default(0),
		revision: integer("revision").notNull().default(0),
		processedRevision: integer("processed_revision").notNull().default(0),
		encryptedContext: text("encrypted_context"),
		state: text("state", { enum: ["empty", "pending", "ready", "failed", "budget", "missing_key"] })
			.notNull()
			.default("empty"),
		hasIncompleteCoverage: boolean("has_incomplete_coverage").notNull().default(false),
		includedEntryCount: integer("included_entry_count").notNull().default(0),

		dirtySince: timestamp("dirty_since", { withTimezone: true }),
		...timestamps(),
	},
	(table) => [
		primaryKey({ columns: [table.topicId, table.userId] }),
		unique("topic_personal_source_contexts_topic_user_unique").on(table.topicId, table.userId),
		index("topic_personal_source_contexts_dirty_idx").on(table.dirtySince),
		check(
			"topic_personal_source_contexts_revision_valid",
			sql`${table.processedRevision} >= 0 and ${table.revision} >= ${table.processedRevision}`,
		),
		check(
			"topic_personal_source_contexts_ciphertext",
			sql`${table.encryptedContext} is null or ${table.encryptedContext} like 'enc1:%'`,
		),
	],
)

// the only received-content table. private title, text, sender, links, and references share one ciphertext
export const personalSourceEntries = pgTable(
	"personal_source_entries",
	{
		id: primaryId(),
		sourceId: text("source_id").notNull(),
		topicId: text("topic_id").notNull(),
		userId: text("user_id").notNull(),
		origin: text("origin", { enum: ["send", "email", "import"] }).notNull(),
		encryptedPayload: text("encrypted_payload").notNull(),
		omittedLinkCount: integer("omitted_link_count").notNull().default(0),
		receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),

		summarizedAt: timestamp("distilled_at", { withTimezone: true }),
	},
	(table) => [
		foreignKey({
			columns: [table.sourceId, table.topicId, table.userId],
			foreignColumns: [sources.id, sources.topicId, sources.personalSourcesUserId],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.topicId, table.userId],
			foreignColumns: [topicPersonalSourceContexts.topicId, topicPersonalSourceContexts.userId],
		}).onDelete("cascade"),
		index("personal_source_entries_topic_received_idx").on(table.topicId, table.receivedAt, table.id),
		index("personal_source_entries_sender_received_idx").on(table.topicId, table.userId, table.receivedAt, table.id),
		index("personal_source_entries_source_received_idx").on(table.sourceId, table.receivedAt),

		check("personal_source_entries_ciphertext", sql`${table.encryptedPayload} like 'enc1:%'`),
		check("personal_source_entries_omissions_valid", sql`${table.omittedLinkCount} >= 0`),
	],
)

// private annotations belong to their sender independently of the Topic's visibility
export const findingPersonalAnnotations = pgTable(
	"finding_personal_annotations",
	{
		findingId: text("finding_id")
			.notNull()
			.references(() => findings.id, { onDelete: "cascade" }),
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		encryptedText: text("encrypted_text").notNull(),

		...timestamps(),
	},
	(table) => [
		primaryKey({ columns: [table.findingId, table.userId] }),
		index("finding_personal_annotations_sender_idx").on(table.userId),
		check("finding_personal_annotations_ciphertext", sql`${table.encryptedText} like 'enc1:%'`),
	],
)

// retain pre-conversion generated text in encrypted sender-only migration snapshots
export const personalSourcesLegacyOutputs = pgTable(
	"personal_source_legacy_outputs",
	{
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		kind: text("kind", { enum: ["finding", "scan"] }).notNull(),
		referenceId: text("reference_id").notNull(),
		encryptedText: text("encrypted_text").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.kind, table.referenceId] }),
		check("personal_source_legacy_outputs_ciphertext", sql`${table.encryptedText} like 'enc1:%'`),
	],
)

// link text remains inside the entry ciphertext. fingerprints identify durable queue claims
export const personalSourcesLinks = pgTable(
	"personal_source_links",
	{
		id: primaryId(),
		entryId: text("entry_id")
			.notNull()
			.references(() => personalSourceEntries.id, { onDelete: "cascade" }),
		fingerprint: text("fingerprint").notNull(),
		position: integer("position").notNull(),
		state: text("state", { enum: ["pending", "claimed", "considered"] })
			.notNull()
			.default("pending"),
		scanId: text("scan_id").references(() => scans.id, { onDelete: "set null" }),
		claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
		consideredAt: timestamp("considered_at", { withTimezone: true }),
		reviewOutcome: text("review_outcome", { enum: ["scored", "rejected"] }),
		reviewReason: text("review_reason"),
	},
	(table) => [
		uniqueIndex("personal_source_links_entry_fingerprint_unique").on(table.entryId, table.fingerprint),
		index("personal_source_links_scan_idx").on(table.scanId),
		check("personal_source_links_position_valid", sql`${table.position} >= 0 and ${table.position} < 100`),
		check("personal_source_links_state_valid", sql`${table.state} in ('pending', 'claimed', 'considered')`),
	],
)

// retry records survive entry and source deletion to prevent replay from restoring removed content
export const personalSourcesDeliveries = pgTable(
	"personal_source_deliveries",
	{
		id: primaryId(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		senderIdentity: text("sender_identity").notNull(),
		requestId: text("request_id").notNull(),
		payloadDigest: text("payload_digest").notNull(),
		entryId: text("entry_id").notNull(),
		queuedLinkCount: integer("queued_link_count").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("personal_source_deliveries_sender_request_unique").on(
			table.userId,
			table.senderIdentity,
			table.requestId,
		),
	],
)

// origin rows retain accepted-only history; their sum enforces one daily send ceiling
export const personalSourcesDailyCounts = pgTable(
	"personal_source_daily_counts",
	{
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		day: text("day").notNull(),
		kind: text("kind", { enum: ["send", "email"] }).notNull(),
		acceptedCount: integer("accepted_count").notNull().default(0),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.day, table.kind] }),
		check(
			"personal_source_daily_counts_valid",
			sql`${table.acceptedCount} >= 0 and ${table.kind} in ('send', 'email')`,
		),
	],
)

// API credentials store a digest and redacted display metadata only
export const aiAgentApiKeys = pgTable(
	"agent_api_keys",
	{
		id: primaryId(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		secretDigest: text("secret_digest").notNull(),
		label: text("label").notNull(),
		lastFour: text("last_four").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
	},
	(table) => [index("agent_api_keys_user_idx").on(table.userId)],
)

// acknowledged mail is resumable without storing another copy of its body or recipient address
export const personalSourcesEmailConfirmations = pgTable(
	"personal_source_email_confirmations",
	{
		id: primaryId(),
		emailId: text("email_id").notNull(),
		userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
		senderDigest: text("sender_digest"),
		outcome: text("outcome", { enum: ["filed", "needs_topic", "not_filed", "account_required"] }),
		replyStartedAt: timestamp("reply_started_at", { withTimezone: true }),
		state: text("state", { enum: ["pending", "processing", "refused", "replied"] })
			.notNull()
			.default("pending"),
		attemptCount: integer("attempt_count").notNull().default(0),
		nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
		...timestamps(),
	},
	(table) => [
		uniqueIndex("personal_source_email_confirmations_email_unique").on(table.emailId),
		index("personal_source_email_confirmations_pending_idx").on(table.state, table.nextAttemptAt),
	],
)

// numbered email choices retain only Topic metadata and the original confirmation reference
export const personalSourcesEmailChoices = pgTable(
	"personal_source_email_choices",
	{
		confirmationId: text("confirmation_id")
			.primaryKey()
			.references(() => personalSourcesEmailConfirmations.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		encryptedTopics: text("encrypted_topics").notNull(),
		messageId: text("message_id").notNull(),
	},
	(table) => [
		check("personal_source_email_choices_ciphertext", sql`${table.encryptedTopics} like 'enc1:%'`),
		index("personal_source_email_choices_message_idx").on(table.userId, table.messageId),
	],
)

// pending reply snapshots disappear with their item or account while confirmation tombstones remain
export const personalSourcesEmailReplies = pgTable(
	"personal_source_email_replies",
	{
		confirmationId: text("confirmation_id")
			.primaryKey()
			.references(() => personalSourcesEmailConfirmations.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		entryId: text("entry_id").references(() => personalSourceEntries.id, { onDelete: "cascade" }),
		encryptedPayload: text("encrypted_payload").notNull(),
	},
	(table) => [check("personal_source_email_replies_ciphertext", sql`${table.encryptedPayload} like 'enc1:%'`)],
)

// each actual model attempt records its owner and cost without prompt or output capture
export const personalSourcesSummarySpends = pgTable(
	"personal_source_distillation_spends",
	{
		id: primaryId(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		topicId: text("topic_id").references(() => topics.id, { onDelete: "set null" }),
		revision: integer("revision").notNull(),
		cost: doublePrecision("cost").notNull().default(0),
		state: text("state", { enum: ["started", "succeeded", "failed", "unknown"] })
			.notNull()
			.default("started"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
	},
	(table) => [
		index("personal_source_distillation_spends_user_created_idx").on(table.userId, table.createdAt),
		check("personal_source_distillation_spends_nonnegative", sql`${table.cost} >= 0`),
	],
)
