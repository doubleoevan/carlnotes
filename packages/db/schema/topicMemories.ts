// the Topic's takeaways from public Findings and their raters' feedback
import {
	TOPIC_MEMORY_NOTE_LIMIT,
	TOPIC_MEMORY_TEXT_LIMIT,
	type TopicMemoryPerson,
	topicMemoryKinds,
	topicMemoryStatuses,
} from "@carlnotes/contracts/topicMemories"
import { sql } from "drizzle-orm"
import {
	type AnyPgColumn,
	boolean,
	check,
	date,
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
import { EMBED_DIMENSIONS, scans } from "./scans"
import { topics } from "./topics"
import { users } from "./users"

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
		factDate: date("fact_date"),
		person: jsonb("person").$type<TopicMemoryPerson>(),
		personMatchKey: text("person_key"),
		// legacy rows keep their feedback and evidence while the new replay builds atomic facts
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
		index("topic_memories_replaced_by_idx").on(table.replacedById),
		index("topic_memories_review_match_idx").on(table.reviewMatchId),
		index("topic_memories_first_scan_idx").on(table.firstScanId),
		index("topic_memories_last_seen_scan_idx").on(table.lastSeenScanId),
		check(
			"topic_memories_text_length",
			sql`char_length(${table.text}) between 1 and ${sql.raw(String(TOPIC_MEMORY_TEXT_LIMIT))}`,
		),
		check("topic_memories_importance_range", sql`${table.importance} between 0 and 1`),
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
		kind: text("kind", { enum: ["merge", "flag"] }).notNull(),
		source: text("source", { enum: ["model", "similarity", "cleanup", "legacy"] }).notNull(),
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
