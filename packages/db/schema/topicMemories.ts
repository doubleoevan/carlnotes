// the Topic's topic memories from public Findings and their raters' feedback
import {
	TOPIC_MEMORY_NOTE_LIMIT,
	TOPIC_MEMORY_TEXT_LIMIT,
	type TopicMemoryPerson,
	topicMemoryClaimTypes,
	topicMemoryKinds,
	topicMemoryStatuses,
} from "@carlnotes/contracts/topicMemories"
import { sql } from "drizzle-orm"
import {
	type AnyPgColumn,
	boolean,
	check,
	index,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	real,
	text,
	vector,
} from "drizzle-orm/pg-core"
import { primaryId, rating, timestamps } from "./columns"
import { EMBED_DIMENSIONS, EMBED_MODEL_NAME, findings, scans } from "./scans"
import { topics } from "./topics"
import { users } from "./users"

// this label marks vectors built from checked claim text alone
export const TOPIC_MEMORY_EMBEDDING_MODEL = `${EMBED_MODEL_NAME}:claim`

/** @public Drizzle Kit uses this export to generate the enum before creating the table. */
export const topicMemoryKind = pgEnum("topic_memory_kind", topicMemoryKinds)
/** @public Drizzle Kit uses this export to generate the enum before creating the table. */
export const topicMemoryStatus = pgEnum("topic_memory_status", topicMemoryStatuses)

export const topicMemories = pgTable(
	"topic_memories",
	{
		id: primaryId(),
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		kind: topicMemoryKind("kind").notNull(),
		text: text("text").notNull(),
		// retain pre-extraction history with a missing key until dev repair checks it
		subject: text("subject"),
		claimType: text("claim_type", { enum: topicMemoryClaimTypes }),
		value: text("value"),
		factDate: text("fact_date"),
		person: jsonb("person").$type<TopicMemoryPerson>(),
		personMatchKey: text("person_key"),
		// only atomic rows can appear in the Journal or join a duplicate match
		isAtomic: boolean("is_atomic").notNull().default(false),
		needsReview: boolean("needs_review").notNull().default(false),
		reviewMatchId: text("review_match_id").references((): AnyPgColumn => topicMemories.id, { onDelete: "set null" }),
		importance: real("importance").notNull(),
		status: topicMemoryStatus("status").notNull().default("active"),
		replacedById: text("replaced_by_id").references((): AnyPgColumn => topicMemories.id, { onDelete: "set null" }),
		firstScanId: text("first_scan_id")
			.notNull()
			.references(() => scans.id, { onDelete: "cascade" }),
		lastSeenScanId: text("last_seen_scan_id")
			.notNull()
			.references(() => scans.id, { onDelete: "cascade" }),
		findingIds: text("finding_ids").array().notNull(),
		embedding: vector("embedding", { dimensions: EMBED_DIMENSIONS }).notNull(),
		embeddingModel: text("embedding_model").notNull(),
		...timestamps(),
	},
	(table) => [
		index("topic_memories_topic_status_importance_idx").on(table.topicId, table.status, table.importance),
		index("topic_memories_exact_claim_idx").on(table.topicId, table.subject, table.claimType, table.factDate),
		index("topic_memories_replaced_by_idx").on(table.replacedById),
		index("topic_memories_review_match_idx").on(table.reviewMatchId),
		index("topic_memories_first_scan_idx").on(table.firstScanId),
		index("topic_memories_last_seen_scan_idx").on(table.lastSeenScanId),
		check(
			"topic_memories_text_length",
			sql`char_length(${table.text}) between 1 and ${sql.raw(String(TOPIC_MEMORY_TEXT_LIMIT))}`,
		),
		check("topic_memories_importance_range", sql`${table.importance} between 0 and 1`),
		check(
			"topic_memories_fact_date_precision",
			sql`${table.factDate} ~ '^[0-9]{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?$'`,
		),
	],
)

// store each canonical name and its evidence-backed aliases within one Topic
export const topicMemorySubjectAliases = pgTable(
	"topic_memory_subject_aliases",
	{
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		aliasKey: text("alias_key").notNull(),
		aliasName: text("alias_name").notNull(),
		canonicalKey: text("canonical_key").notNull(),
		canonicalName: text("canonical_name").notNull(),
		person: jsonb("person").$type<TopicMemoryPerson>(),
		findingId: text("finding_id").references(() => findings.id, { onDelete: "set null" }),
	},
	(table) => [
		primaryKey({ columns: [table.topicId, table.aliasKey] }),
		index("topic_memory_subject_aliases_finding_idx").on(table.findingId),
	],
)

export const topicMemoryFeedback = pgTable(
	"topic_memory_feedback",
	{
		topicMemoryId: text("topic_memory_id")
			.notNull()
			.references(() => topicMemories.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		rating: rating("rating").notNull(),
		note: text("note"),
		...timestamps(),
	},
	(table) => [
		primaryKey({ columns: [table.topicMemoryId, table.userId] }),
		index("topic_memory_feedback_user_idx").on(table.userId),
		check(
			"topic_memory_feedback_note_length",
			sql`char_length(${table.note}) <= ${sql.raw(String(TOPIC_MEMORY_NOTE_LIMIT))}`,
		),
	],
)

// one decision per applied merge or review flag, including a proposal that never became its own row
export const topicMemoryDecisions = pgTable(
	"topic_memory_decisions",
	{
		id: primaryId(),
		scanId: text("scan_id")
			.notNull()
			.references(() => scans.id, { onDelete: "cascade" }),
		memoryId: text("memory_id")
			.notNull()
			.references(() => topicMemories.id, { onDelete: "cascade" }),
		candidateMemoryId: text("candidate_memory_id").references(() => topicMemories.id, { onDelete: "set null" }),
		matchMemoryId: text("match_memory_id").references(() => topicMemories.id, { onDelete: "set null" }),
		kind: text("kind", { enum: ["merge", "replace", "flag"] }).notNull(),
		source: text("source", { enum: ["exact", "model", "similarity", "cleanup", "legacy"] }).notNull(),
		candidateText: text("candidate_text"),
		matchText: text("match_text"),
		cosine: real("cosine"),
		...timestamps(),
	},
	(table) => [
		index("topic_memory_decisions_scan_idx").on(table.scanId),
		index("topic_memory_decisions_memory_idx").on(table.memoryId),
		index("topic_memory_decisions_candidate_idx").on(table.candidateMemoryId),
		index("topic_memory_decisions_match_idx").on(table.matchMemoryId),
	],
)
