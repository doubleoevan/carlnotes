// reads active takeaways in shared rank order and stores authorized feedback
import {
	TOPIC_MEMORY_PAGE_SIZE,
	type TopicMemoriesPage,
	type TopicMemory,
	type TopicMemoryFeedback,
} from "@carlnotes/contracts/topicMemories"
import { TOPIC_MEMORY_PROMPT_LIMIT, TOPIC_MEMORY_SAVED_TAKEAWAY_LIMIT } from "@carlnotes/contracts/topicMemoryWork"
import { and, cosineDistance, count, desc, eq, ne, or, type SQL, sql } from "drizzle-orm"
import { toActivatedScanFilter, toPlatformAdminFilter, toTopicRoleFilter } from "./contentFilters"
import { canRateTopicMemories } from "./findingPermissions"
import { type DbHandle, type DbTransaction, db } from "./index"
import { lockPersonalSourcesTopic } from "./personalSourcesLocks"
import { podcastEpisodes } from "./schema/podcast"
import { EMBED_MODEL_NAME, scans } from "./schema/scans"
import { topicMemories, topicMemoryFeedback } from "./schema/topicMemories"
import { topics } from "./schema/topics"
import { gatedTopicColumns, loadTopicRole, toTopicAccessFilter } from "./topicPermissions"

// the latest correction wins when several authorized raters have supplied notes
export const topicMemoryCorrection = sql<string | null>`(
	select ${topicMemoryFeedback.note} from ${topicMemoryFeedback}
	where ${topicMemoryFeedback.topicMemoryId} = ${topicMemories.id}
	and ${topicMemoryFeedback.rating} = 'down' and ${topicMemoryFeedback.note} is not null
	order by ${topicMemoryFeedback.updatedAt} desc, ${topicMemoryFeedback.userId} limit 1
)`

export type TopicMemoryPromptFeedback = { rating: "up" | "down"; note: string }
const TOPIC_MEMORY_FEEDBACK_PER_PROMPT = 6

// both thumbs can attach material for Carl. keep the most recent bounded notes without identifying the raters
export const topicMemoryPromptFeedback = sql<TopicMemoryPromptFeedback[]>`coalesce((
	select jsonb_agg(jsonb_build_object('rating', journal_feedback.rating, 'note', journal_feedback.note)
		order by journal_feedback.updated_at desc, journal_feedback.user_id)
	from (select rating, note, updated_at, user_id from ${topicMemoryFeedback}
		where ${topicMemoryFeedback.topicMemoryId} = ${topicMemories.id} and ${topicMemoryFeedback.note} is not null
		order by updated_at desc, user_id limit ${TOPIC_MEMORY_FEEDBACK_PER_PROMPT}) as journal_feedback
), '[]'::jsonb)`

// count a takeaway with a thumbs-up once, regardless of how many raters agree
export const topicMemoryIsSaved = sql<boolean>`exists (
	select 1 from ${topicMemoryFeedback}
	where ${topicMemoryFeedback.topicMemoryId} = ${topicMemories.id} and ${topicMemoryFeedback.rating} = 'up'
)`

const feedbackPriority = sql`case when ${topicMemoryIsSaved} then 0 when ${topicMemoryCorrection} is not null then 1 else 2 end`

type JournalPage = Omit<TopicMemoriesPage, "canRate">
type JournalRow = Omit<TopicMemory, "firstScanAt"> & { firstScanAt: Date }

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
	// the app has already enforced its Topic entitlement
	const [rows, takeawayCount] = await Promise.all([
		selectTopicMemoryPage({ topicId, userId, page, visibility }),
		countVisibleTopicMemories({ topicId, userId, visibility }),
	])
	return toTopicMemoryPage(rows, takeawayCount)
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
	const entries = selectTopicMemoryPage({ topicId, userId, page }).as("journal_entries")
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
			},
			takeawayCount: toVisibleTopicMemoryCount({ topicId, userId }),
		})
		.from(topics)
		.leftJoinLateral(entries, sql`true`)
		.where(and(eq(topics.id, topicId), or(ne(topics.visibility, "private"), canReadPrivateTopic)))
	const first = rows[0]
	return first
		? {
				topic: first.topic,
				page: toTopicMemoryPage(
					rows.flatMap(({ entry }) => (entry ? [entry] : [])),
					first.takeawayCount,
				),
			}
		: null
}

// compare the user's invite activation with the first Scan
function selectTopicMemoryPage({ page, ...options }: VisibleTopicMemoriesOptions & { page: number }) {
	const { userId } = options
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
			firstScanAt: scans.startedAt,
			episodeNumber: podcastEpisodes.episodeNumber,
			rating: topicMemoryFeedback.rating,
			note: topicMemoryFeedback.note,
		})
		.from(topicMemories)
		.innerJoin(scans, eq(scans.id, topicMemories.firstScanId))
		.innerJoin(topics, eq(topics.id, topicMemories.topicId))
		.leftJoin(podcastEpisodes, eq(podcastEpisodes.scanId, scans.id))
		.leftJoin(
			topicMemoryFeedback,
			userId
				? and(eq(topicMemoryFeedback.topicMemoryId, topicMemories.id), eq(topicMemoryFeedback.userId, userId))
				: sql`false`,
		)
		.where(toVisibleTopicMemories(options))
		.orderBy(feedbackPriority, desc(topicMemories.importance), desc(topicMemories.updatedAt), topicMemories.id)
		.limit(TOPIC_MEMORY_PAGE_SIZE)
		.offset((page - 1) * TOPIC_MEMORY_PAGE_SIZE)
}

function toTopicMemoryPage(rows: JournalRow[], takeawayCount: number): JournalPage {
	return {
		items: rows.map((row) => ({ ...row, firstScanAt: row.firstScanAt.toISOString() })),
		pageCount: Math.ceil(takeawayCount / TOPIC_MEMORY_PAGE_SIZE),
	}
}

type VisibleTopicMemoriesOptions = {
	topicId: string
	userId: string | null
	visibility?: (typeof topics.$inferSelect)["visibility"]
}

/** Projects the visible takeaway count alongside the already authorized Topic's scan history. */
export function toVisibleTopicMemoryCount(options: VisibleTopicMemoriesOptions): SQL<number> {
	return sql<number>`(${selectVisibleTopicMemoryCount(options)})`.mapWith(Number)
}

// use the same first-brew visibility filter as the Journal rows
function selectVisibleTopicMemoryCount(options: VisibleTopicMemoriesOptions) {
	return db
		.select({ count: count() })
		.from(topicMemories)
		.innerJoin(scans, eq(scans.id, topicMemories.firstScanId))
		.innerJoin(topics, eq(topics.id, topicMemories.topicId))
		.where(toVisibleTopicMemories(options))
}

// read the total on its own when getting a Journal page
async function countVisibleTopicMemories(options: VisibleTopicMemoriesOptions): Promise<number> {
	const [total] = await selectVisibleTopicMemoryCount(options)
	return total?.count ?? 0
}

// recheck nonpublic Topic access when the app reads the count or rows
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

/** Selects a bounded prompt slice. Cosine distance is exact over this Topic's active set. */
export async function loadRankedTopicMemories({
	topicId,
	embeddings = [],
	isPublicOnly,
}: {
	topicId: string
	embeddings?: number[][]
	isPublicOnly?: boolean
}): Promise<
	{
		text: string
		correction: string | null
		factDate: string | null
		feedback: TopicMemoryPromptFeedback[]
		findingIds: string[]
		lastSeenAt: Date
	}[]
> {
	// the best match to any chapter leads within its feedback tier
	const distances = embeddings.map((embedding) => cosineDistance(topicMemories.embedding, embedding))
	const relevance =
		distances.length > 0
			? [
					sql`case when ${topicMemories.embeddingModel} = ${EMBED_MODEL_NAME}
			then least(${sql.join(distances, sql`, `)}) end asc nulls last`,
				]
			: []
	const publicOnly = isPublicOnly
		? sql`exists (select 1 from ${topics} where ${topics.id} = ${topicMemories.topicId} and ${topics.visibility} = 'public')`
		: undefined
	return db
		.select({
			text: topicMemories.text,
			correction: topicMemoryCorrection,
			factDate: topicMemories.factDate,
			person: topicMemories.person,
			feedback: topicMemoryPromptFeedback.as("prompt_feedback"),
			findingIds: sql<string[]>`${topicMemories.findingIds}[1:30]`,
			lastSeenAt: scans.startedAt,
		})
		.from(topicMemories)
		.innerJoin(scans, eq(scans.id, topicMemories.lastSeenScanId))
		.where(and(toActiveTopicMemories(topicId), publicOnly))
		.orderBy(
			feedbackPriority,
			...relevance,
			desc(topicMemories.importance),
			desc(topicMemories.updatedAt),
			topicMemories.id,
		)
		.limit(TOPIC_MEMORY_PROMPT_LIMIT)
}

type SaveTopicMemoryFeedbackOptions = {
	topicId: string
	topicMemoryId: string
	userId: string
	feedback: TopicMemoryFeedback
}

/** Saves one user's vote on an active takeaway. A downvote without a note retires it immediately. */
export function saveTopicMemoryFeedback(
	options: SaveTopicMemoryFeedbackOptions,
): Promise<"saved" | "missing" | "forbidden" | "savedTakeawayLimit"> {
	return db.transaction(async (transaction) => {
		// recheck the sender's authority after waiting for writes on the same Topic
		const { topicId, userId } = options
		const topic = await lockPersonalSourcesTopic(transaction, topicId)
		if (!topic) {
			return "missing"
		}
		// a lead can lose access while this request waits on the lock
		if (!canRateTopicMemories(await loadTopicRole({ userId, topic, handle: transaction }))) {
			return "forbidden"
		}
		return writeTopicMemoryFeedback(transaction, options)
	})
}

// the Topic lock protects the active set and the saved count through this write
async function writeTopicMemoryFeedback(
	transaction: DbTransaction,
	{ topicId, topicMemoryId, userId, feedback }: SaveTopicMemoryFeedbackOptions,
): Promise<"saved" | "missing" | "savedTakeawayLimit"> {
	// only the named Topic's active takeaways may change
	const [memory] = await transaction
		.select({ id: topicMemories.id, isSavedTakeaway: topicMemoryIsSaved })
		.from(topicMemories)
		.where(and(toActiveTopicMemories(topicId), eq(topicMemories.id, topicMemoryId)))
	if (!memory) {
		return "missing"
	}

	// clear the caller's vote, including any correction it supplied
	if (feedback.rating === null) {
		await transaction
			.delete(topicMemoryFeedback)
			.where(and(eq(topicMemoryFeedback.topicMemoryId, topicMemoryId), eq(topicMemoryFeedback.userId, userId)))
		return "saved"
	}

	// check the cap under the same Topic lock as the vote. another vote on a saved takeaway uses no slot
	if (
		feedback.rating === "up" &&
		!memory.isSavedTakeaway &&
		(await hasReachedSavedTakeawayLimit(transaction, topicId))
	) {
		return "savedTakeawayLimit"
	}

	// both thumbs save their own note. only a downvote's note corrects the takeaway
	const note = feedback.note?.trim() || null
	const updatedAt = new Date()
	const values = { rating: feedback.rating, note, updatedAt }
	await transaction
		.insert(topicMemoryFeedback)
		.values({ topicMemoryId, userId, ...values })
		.onConflictDoUpdate({ target: [topicMemoryFeedback.topicMemoryId, topicMemoryFeedback.userId], set: values })
	// clearing a takeaway requires an explicit downvote without a correction
	await transaction
		.update(topicMemories)
		.set({ updatedAt, status: feedback.rating === "down" && !note ? "rejected" : "active" })
		.where(eq(topicMemories.id, topicMemoryId))
	return "saved"
}

function toActiveTopicMemories(topicId: string): SQL | undefined {
	return and(eq(topicMemories.topicId, topicId), eq(topicMemories.status, "active"), eq(topicMemories.isAtomic, true))
}

// the caller owns the Topic lock, so a concurrent vote cannot claim this same slot
async function hasReachedSavedTakeawayLimit(handle: DbHandle, topicId: string): Promise<boolean> {
	const [saved] = await handle
		.select({ count: count() })
		.from(topicMemories)
		.where(and(toActiveTopicMemories(topicId), topicMemoryIsSaved))
	return (saved?.count ?? 0) >= TOPIC_MEMORY_SAVED_TAKEAWAY_LIMIT
}
