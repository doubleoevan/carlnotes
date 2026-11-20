// the Journal page reads, the topic memory feedback SQL, the grouping columns, and the active topic memory filter
import {
	TOPIC_MEMORY_CALENDAR_DATE_PATTERN,
	TOPIC_MEMORY_INCOMPLETE_CONTEXT_PATTERN,
	TOPIC_MEMORY_JOB_START_PATTERN,
	TOPIC_MEMORY_PAGE_SIZE,
	TOPIC_MEMORY_UNNAMED_SUBJECT_PATTERN,
	type TopicMemoriesPage,
	type TopicMemory,
	toNamedTopicMemoryText,
	toTopicMemoryPageNumber,
} from "@carlnotes/contracts/topicMemories"
import { TOPIC_MEMORY_GROUP_CANDIDATE_LIMIT, toMostPreciseTopicMemoryDate } from "@carlnotes/contracts/topicMemoryWork"
import { and, eq, ne, or, type SQL, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { toActivatedScanFilter, toPlatformAdminFilter, toTopicRoleFilter } from "./contentFilters"
import { db } from "./index"
import { podcastEpisodes } from "./schema/podcast"
import { scans } from "./schema/scans"
import { teamMembers } from "./schema/teams"
import { TOPIC_MEMORY_EMBEDDING_MODEL, topicMemories, topicMemoryFeedback } from "./schema/topicMemories"
import { topics } from "./schema/topics"
import { groupTopicMemories, preferTopicMemoryRepresentative } from "./topicMemoryGroups"
import { gatedTopicColumns, toTopicAccessFilter } from "./topicPermissions"

// the rater leads the team that owns the rated Topic
const raterLeadsOwningTeam = sql`exists (
	select 1 from ${teamMembers} as rater_membership
	where rater_membership.team_id = rated_topic.team_id
	and rater_membership.user_id = ${topicMemoryFeedback.userId}
	and rater_membership.is_active and rater_membership.role = 'leader'
)`

// the rated Topic's owner is an active member of that team
const ownerIsOnOwningTeam = sql`exists (
	select 1 from ${teamMembers} as owner_membership
	where owner_membership.team_id = rated_topic.team_id
	and owner_membership.user_id = rated_topic.owner_id and owner_membership.is_active
)`

// a rating counts only while its rater may still rate: the Topic's owner, or a leader of the owning team while the
// owner is an active member of it. the SQL form of canRateTopicMemories
export const topicMemoryRaterCanRate = sql<boolean>`exists (
	select 1 from ${topics} as rated_topic
	where rated_topic.id = ${topicMemories.topicId}
	and (rated_topic.owner_id = ${topicMemoryFeedback.userId} or (${raterLeadsOwningTeam} and ${ownerIsOnOwningTeam}))
)`

// the latest correction wins if several raters have supplied notes
export const topicMemoryCorrection = sql<string | null>`(
	select ${topicMemoryFeedback.note} from ${topicMemoryFeedback}
	where ${topicMemoryFeedback.topicMemoryId} = ${topicMemories.id}
	and ${topicMemoryFeedback.rating} = 'down' and ${topicMemoryFeedback.note} is not null
	and ${topicMemoryRaterCanRate}
	order by ${topicMemoryFeedback.updatedAt} desc, ${topicMemoryFeedback.userId} limit 1
)`

// one rater's feedback as a prompt reads it, and how many a prompt keeps for one topic memory
export type TopicMemoryPromptFeedback = { rating: "up" | "down"; note: string }
export const TOPIC_MEMORY_FEEDBACK_PER_PROMPT = 6

// both thumbs can attach material for Carl. keep the most recent bounded notes without identifying the raters
export const topicMemoryPromptFeedback = sql<TopicMemoryPromptFeedback[]>`coalesce((
	select jsonb_agg(jsonb_build_object('rating', journal_feedback.rating, 'note', journal_feedback.note)
		order by journal_feedback.updated_at desc, journal_feedback.user_id)
	from (select rating, note, updated_at, user_id from ${topicMemoryFeedback}
		where ${topicMemoryFeedback.topicMemoryId} = ${topicMemories.id} and ${topicMemoryFeedback.note} is not null
		and ${topicMemoryRaterCanRate}
		order by updated_at desc, user_id limit ${TOPIC_MEMORY_FEEDBACK_PER_PROMPT}) as journal_feedback
), '[]'::jsonb)`

// count a topic memory with a thumbs-up once, regardless of how many raters agree
export const topicMemoryIsSaved = sql<boolean>`exists (
	select 1 from ${topicMemoryFeedback}
	where ${topicMemoryFeedback.topicMemoryId} = ${topicMemories.id} and ${topicMemoryFeedback.rating} = 'up'
	and ${topicMemoryRaterCanRate}
)`

// a Journal page before the caller's own canRate, and a row that the page groups
type JournalPage = Omit<TopicMemoriesPage, "canRate">
type JournalRow = Omit<TopicMemory, "firstScanAt" | "factDate"> & {
	rank?: number
	factDate: string | null
	firstScanAt: Date
	// the columns that group duplicate rows
	subject: (typeof topicMemories.$inferSelect)["subject"]
	claimType: (typeof topicMemories.$inferSelect)["claimType"]
	value: (typeof topicMemories.$inferSelect)["value"]
	embedding: number[] | null
	embeddingModel: string
	lastSeenAt: Date
}

/** Reads one Journal page without revealing other raters' notes. */
export async function loadTopicMemoriesPage({
	topicId,
	userId,
	page,
	visibility,
}: {
	topicId: string
	userId: string | null
	page: number
	visibility?: (typeof topics.$inferSelect)["visibility"]
}): Promise<JournalPage> {
	// group authorized rows before slicing. a group never straddles pages
	const rows = await selectTopicMemoryRows({ topicId, userId, visibility })
	return toTopicMemoryPage(rows, page)
}

/** Reads the Topic, count and page in the same snapshot as the private membership check. */
export async function loadMemberTopicMemoriesPage({
	topicId,
	userId,
	page,
}: {
	topicId: string
	userId: string | null
	page: number
}): Promise<{ topic: Pick<typeof topics.$inferSelect, keyof typeof gatedTopicColumns>; page: JournalPage } | null> {
	// anchor the count and page to the permitted Topic so an empty page is distinct from a denied read
	const entries = selectTopicMemoryRows({ topicId, userId }).as("journal_entries")
	const canReadPrivateTopic = userId ? toTopicRoleFilter(userId) : undefined
	const rows = await db
		.select({
			topic: gatedTopicColumns,
			entry: {
				id: entries.id,
				text: entries.text,
				factDate: entries.factDate,
				person: entries.person,
				kind: entries.kind,
				firstScanAt: entries.firstScanAt,
				episodeNumber: entries.episodeNumber,
				rating: entries.rating,
				note: entries.note,
				subject: entries.subject,
				claimType: entries.claimType,
				value: entries.value,
				embedding: entries.embedding,
				embeddingModel: entries.embeddingModel,
				lastSeenAt: entries.lastSeenAt,
			},
		})
		.from(topics)
		.leftJoinLateral(entries, sql`true`)
		.where(and(eq(topics.id, topicId), or(ne(topics.visibility, "private"), canReadPrivateTopic)))
		.orderBy(entries.rank)
	const first = rows[0]
	return first
		? {
				topic: first.topic,
				page: toTopicMemoryPage(
					rows.flatMap(({ entry }) => (entry ? [entry] : [])),
					page,
				),
			}
		: null
}

// compare the user's invite activation with the first Scan
function selectTopicMemoryRows(options: VisibleTopicMemoriesOptions) {
	const { userId } = options
	const latestScan = alias(scans, "journal_latest_scan")
	const addedOrder = sql`${topicMemories.createdAt}, ${topicMemories.id}`
	return db
		.select({
			id: topicMemories.id,
			text: topicMemories.text,
			kind: sql<
				TopicMemory["kind"]
			>`case when ${topicMemoryCorrection} is not null or ${topicMemories.kind} = 'correction'
				then 'correction' else 'fact' end`.as("memory_kind"),
			factDate: topicMemories.factDate,
			person: topicMemories.person,
			firstScanAt: sql<Date>`${scans.startedAt}`.mapWith(scans.startedAt).as("first_scan_at"),
			episodeNumber: podcastEpisodes.episodeNumber,
			rating: topicMemoryFeedback.rating,
			note: topicMemoryFeedback.note,
			...topicMemoryGroupingColumns(),
			rank: sql<number>`row_number() over (order by ${addedOrder})`.as("journal_rank"),
			lastSeenAt: sql<Date>`${latestScan.startedAt}`.mapWith(latestScan.startedAt).as("last_seen_at"),
		})
		.from(topicMemories)
		.innerJoin(scans, eq(scans.id, topicMemories.firstScanId))
		.innerJoin(latestScan, eq(latestScan.id, topicMemories.lastSeenScanId))
		.innerJoin(topics, eq(topics.id, topicMemories.topicId))
		.leftJoin(podcastEpisodes, eq(podcastEpisodes.scanId, scans.id))
		.leftJoin(
			topicMemoryFeedback,
			userId
				? and(eq(topicMemoryFeedback.topicMemoryId, topicMemories.id), eq(topicMemoryFeedback.userId, userId))
				: sql`false`,
		)
		.where(toVisibleTopicMemories(options))
		.orderBy(addedOrder)
}

/**
 * Fetches vectors only for comparable rows in the bounded grouping buckets. A row with no claim type or with another
 * embedding model stands alone in groupTopicMemories, so its vector is never read.
 */
export function topicMemoryGroupingColumns() {
	return {
		subject: topicMemories.subject,
		claimType: topicMemories.claimType,
		value: topicMemories.value,
		embeddingModel: topicMemories.embeddingModel,
		embedding: sql<number[] | null>`case when ${topicMemories.subject} is not null
			and ${topicMemories.claimType} is not null
			and ${topicMemories.value} is not null
			and ${topicMemories.embeddingModel} = ${TOPIC_MEMORY_EMBEDDING_MODEL}
			and count(*) over (partition by ${topicMemories.subject}, ${topicMemories.claimType}, ${topicMemories.value}) > 1
			and row_number() over (partition by ${topicMemories.subject}, ${topicMemories.claimType}, ${topicMemories.value} order by ${topicMemories.id}) <= ${TOPIC_MEMORY_GROUP_CANDIDATE_LIMIT}
			then ${topicMemories.embedding} end`
			.mapWith(topicMemories.embedding)
			.as("group_embedding"),
	}
}

function toTopicMemoryPage(rows: JournalRow[], page: number): JournalPage {
	// rank groups by their first saved row and show the most recently added groups first
	const groups = groupTopicMemories(rows, preferTopicMemoryRepresentative).reverse()
	// clamp to the last page of the same grouped snapshot used to choose the representatives
	const pageCount = Math.ceil(groups.length / TOPIC_MEMORY_PAGE_SIZE)
	const start = (toTopicMemoryPageNumber(page, pageCount) - 1) * TOPIC_MEMORY_PAGE_SIZE
	return {
		items: groups.slice(start, start + TOPIC_MEMORY_PAGE_SIZE).flatMap((group) => {
			const [first] = group
			if (!first) {
				return []
			}
			// a page item has no grouping column
			const {
				subject: _subject,
				claimType: _claimType,
				value: _value,
				embedding: _embedding,
				embeddingModel: _model,
				lastSeenAt: _lastSeenAt,
				rank: _rank,
				...row
			} = first
			const text = toNamedTopicMemoryText(row.text, row.person) ?? row.text
			// a newer statement with no date must not hide compatible evidence of the event day
			const factDate = group.reduce((date, member) => toMostPreciseTopicMemoryDate(date, member.factDate), row.factDate)
			// the caller's own rating and note come from the statement that they rated, with its id, so a newer
			// statement of the fact never hides them and their next rating edits the same row. a correction on any
			// statement marks the fact
			const { id, rating, note } = group.find((member) => member.rating !== null) ?? first
			const kind = group.some((member) => member.kind === "correction") ? "correction" : row.kind
			return [{ ...row, id, rating, note, kind, text, factDate, firstScanAt: row.firstScanAt.toISOString() }]
		}),
		pageCount,
	}
}

type VisibleTopicMemoriesOptions = {
	topicId: string
	userId: string | null
	visibility?: (typeof topics.$inferSelect)["visibility"]
}

function selectVisibleTopicMemoryGroupRows(options: VisibleTopicMemoriesOptions) {
	return db
		.select({ id: topicMemories.id, factDate: topicMemories.factDate, ...topicMemoryGroupingColumns() })
		.from(topicMemories)
		.innerJoin(scans, eq(scans.id, topicMemories.firstScanId))
		.innerJoin(topics, eq(topics.id, topicMemories.topicId))
		.where(toVisibleTopicMemories(options))
}

type VisibleTopicMemoryGroupRow = Awaited<ReturnType<typeof selectVisibleTopicMemoryGroupRows>>[number]

// what a count of a Topic's Journal groups reads: how many visible rows can join no group, and the rows that can
export type VisibleTopicMemoryGroups = { ungroupedCount: number; groupRows: VisibleTopicMemoryGroupRow[] }

/**
 * Projects the authorized inputs of a Journal group count into the existing Topic Scan query. A row with no vector
 * read for it can join no group, so it is counted in SQL, and only the rows that share a subject, a claim type, and a
 * value with another row are returned for grouping.
 */
export function toVisibleTopicMemoryGroups(options: VisibleTopicMemoriesOptions): SQL<VisibleTopicMemoryGroups> {
	// decode only the candidate vectors rather than exposing any text or feedback
	const rows = selectVisibleTopicMemoryGroupRows(options).as("visible_topic_memory_groups")
	const groupRow = sql`json_build_object(
		'id', ${rows.id}, 'subject', ${rows.subject}, 'claimType', ${rows.claimType}, 'value', ${rows.value},
		'factDate', ${rows.factDate}, 'embeddingModel', ${rows.embeddingModel},
		'embedding', ${rows.embedding}::text::json
	)`
	return sql<VisibleTopicMemoryGroups>`(select json_build_object(
		'ungroupedCount', count(*) filter (where ${rows.embedding} is null),
		'groupRows', coalesce(json_agg(${groupRow}) filter (where ${rows.embedding} is not null), '[]'::json)
	) from ${rows})`
}

/**
 * Returns how many groups a Topic's Journal shows the user whose grouping inputs these are.
 */
export function toTopicMemoryGroupCount(groups: VisibleTopicMemoryGroups | null | undefined): number {
	return groups ? groups.ungroupedCount + groupTopicMemories(groups.groupRows).length : 0
}

function toVisibleTopicMemories({ topicId, userId, visibility }: VisibleTopicMemoriesOptions): SQL | undefined {
	return and(
		toActiveTopicMemories(topicId),
		visibility ? eq(topics.visibility, visibility) : undefined,
		visibility && visibility !== "public"
			? userId
				? or(toTopicAccessFilter(userId), toPlatformAdminFilter(userId))
				: sql`false`
			: undefined,
		toActivatedScanFilter(userId),
	)
}

export function toActiveTopicMemories(topicId: string): SQL | undefined {
	return and(
		eq(topicMemories.topicId, topicId),
		eq(topicMemories.status, "active"),
		eq(topicMemories.isAtomic, true),
		sql`${topicMemories.text} !~* ${TOPIC_MEMORY_INCOMPLETE_CONTEXT_PATTERN}`,
		or(
			sql`${topicMemories.text} !~* ${TOPIC_MEMORY_JOB_START_PATTERN}`,
			sql`${topicMemories.text} ~ ${TOPIC_MEMORY_CALENDAR_DATE_PATTERN}`,
		),
		or(
			sql`${topicMemories.person} is not null`,
			sql`${topicMemories.text} !~* ${TOPIC_MEMORY_UNNAMED_SUBJECT_PATTERN}`,
		),
	)
}
