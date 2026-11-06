// bounded live snapshots and revision-checked encrypted commits for private context
import {
	PERSONAL_SOURCES_CONTEXT_INPUT_CHARS,
	PERSONAL_SOURCES_CONTEXT_OUTPUT_CHARS,
} from "@carlnotes/contracts/personalSources"
import { decryptPrivateText, encryptPrivateText } from "@carlnotes/server/privateText"
import { and, count, desc, eq, exists, inArray, isNotNull, or, sql } from "drizzle-orm"
import { type DbHandle, db } from "./index"
import { personalSourcePayloadBytes, readPersonalSourcePayloads } from "./personalSourcePayloads"
import { isPersonalSourcesTopic } from "./personalSourcesAuthority"
import { lockPersonalSourcesTopic } from "./personalSourcesLocks"
import {
	personalSourceEntries,
	personalSourcesSummarySpends,
	topicPersonalSourceContexts,
} from "./schema/personalSources"
import { topics } from "./schema/topics"
import { users } from "./schema/users"
import { toEditableTopicFilter } from "./topicPermissions"

// this snapshot stays inside one activity. only its content-free outcome crosses a workflow boundary
export type PersonalSourcesContextSnapshot = {
	topicId: string
	userId: string
	billingUserId: string
	revision: number
	topic: string
	entries: string
	entryIds: string[]
	hasIncompleteCoverage: boolean
	litellmApiKey: string | null
}
const MAX_SNAPSHOT_ENTRIES = 1000

// a content-free version identifies the private input a review must recheck before a model call
export type PersonalSourcesContextVersion = { topicId: string; userId: string; revision: number }
export type PersonalSourcesReviewContext = PersonalSourcesContextVersion & {
	text: string
	expiresAt: string | null
	includedEntryCount: number
	hasIncompleteCoverage: boolean
}

/**
 * Loads bounded excerpts one ciphertext at a time without retaining every imported transcript in memory.
 */
export async function loadPersonalSourcesContextSnapshot(
	topicId: string,
): Promise<PersonalSourcesContextSnapshot | null> {
	// select one eligible sender whose pending revision is ready to retry
	const records = await db
		.select({ topic: topics, context: topicPersonalSourceContexts, key: users.litellmVirtualKey })
		.from(topicPersonalSourceContexts)
		.innerJoin(topics, eq(topics.id, topicPersonalSourceContexts.topicId))
		.innerJoin(users, eq(users.id, topics.ownerId))
		.where(
			and(
				eq(topics.id, topicId),
				toEditableTopicFilter(topicPersonalSourceContexts.userId),
				or(
					eq(topicPersonalSourceContexts.state, "pending"),
					eq(topicPersonalSourceContexts.state, "empty"),
					and(eq(topicPersonalSourceContexts.state, "missing_key"), isNotNull(users.litellmVirtualKey)),
					sql`${topicPersonalSourceContexts.updatedAt} <= clock_timestamp() - interval '15 minutes'`,
				),
				sql`${topicPersonalSourceContexts.revision} > ${topicPersonalSourceContexts.processedRevision}`,
			),
		)
		.orderBy(topicPersonalSourceContexts.updatedAt, topicPersonalSourceContexts.userId)
		.limit(1)
	const record = records[0]
	if (!record) {
		return null
	}

	// count retained items and select the newest bounded context window
	const [totals] = await db
		.select({ count: count() })
		.from(personalSourceEntries)
		.where(and(eq(personalSourceEntries.topicId, topicId), eq(personalSourceEntries.userId, record.context.userId)))
	const entryRows = await db
		.select({ entryId: personalSourceEntries.id, bytes: personalSourcePayloadBytes })
		.from(personalSourceEntries)
		.where(and(eq(personalSourceEntries.topicId, topicId), eq(personalSourceEntries.userId, record.context.userId)))
		.orderBy(desc(personalSourceEntries.receivedAt), desc(personalSourceEntries.id))
		.limit(MAX_SNAPSHOT_ENTRIES)
	const topic = `${record.topic.name}\n${record.topic.prompt}`.slice(0, 2000)
	const excerpts = await loadPersonalSourcesExcerpts({
		topicId,
		userId: record.context.userId,
		entryRows,
		charBudget: PERSONAL_SOURCES_CONTEXT_INPUT_CHARS - topic.length,
	})
	if ((totals?.count ?? 0) > 0 && excerpts.entryIds.length === 0) {
		throw new Error("Personal sources context cannot read live encrypted entries")
	}
	return {
		topicId,
		userId: record.context.userId,
		revision: record.context.revision,
		billingUserId: record.topic.ownerId,
		topic,
		...excerpts,
		hasIncompleteCoverage: excerpts.hasIncompleteCoverage || (totals?.count ?? 0) > entryRows.length,

		litellmApiKey: record.key,
	}
}

// equal shares keep one long import from consuming every other entry's allocation
async function loadPersonalSourcesExcerpts({
	topicId,
	userId,
	entryRows,
	charBudget,
}: {
	topicId: string
	userId: string
	entryRows: { entryId: string; bytes: number }[]
	charBudget: number
}): Promise<Pick<PersonalSourcesContextSnapshot, "entries" | "entryIds" | "hasIncompleteCoverage">> {
	const share = Math.max(0, Math.floor(charBudget / Math.max(1, entryRows.length)) - 2)
	const excerpts: string[] = []
	const includedEntryIds: string[] = []
	let hasIncompleteCoverage = false
	const scope = and(eq(personalSourceEntries.topicId, topicId), eq(personalSourceEntries.userId, userId))
	for await (const { entryId, payload } of readPersonalSourcePayloads(db, entryRows, scope)) {
		if (!payload) {
			hasIncompleteCoverage = true
			continue
		}
		const title = payload.title.slice(0, Math.floor(share / 4))
		const sender = payload.sender.slice(0, Math.floor(share / 8))
		const prefix = `${title}\n${sender}\n`
		const body = `${payload.text}\n${payload.links.join("\n")}`
		const excerpt = `${prefix}${body.slice(0, Math.max(0, share - prefix.length))}`.slice(0, share)
		hasIncompleteCoverage ||= excerpt.length < payload.title.length + payload.sender.length + body.length + 2
		excerpts.push(excerpt)
		includedEntryIds.push(entryId)
	}
	return { entries: excerpts.join("\n\n"), entryIds: includedEntryIds, hasIncompleteCoverage }
}

/**
 * Commits a model result while its revision, sender, and billing owner are current.
 */
export async function commitPersonalSourcesContext({
	snapshot,
	context,
	spendId,
	cost,
}: {
	snapshot: PersonalSourcesContextSnapshot
	context: string
	spendId?: string
	cost: number
}): Promise<boolean> {
	return db.transaction(async (transaction) => {
		// record actual paid work even when a newer revision makes its text unusable
		if (spendId) {
			await transaction
				.update(personalSourcesSummarySpends)
				.set({ cost, state: "succeeded", finishedAt: new Date() })
				.where(eq(personalSourcesSummarySpends.id, spendId))
		}
		const topic = await lockPersonalSourcesTopic(transaction, snapshot.topicId)
		if (
			!topic ||
			topic.ownerId !== snapshot.billingUserId ||
			!(await isPersonalSourcesTopic({ userId: snapshot.userId, topic, transaction }))
		) {
			return false
		}

		// never publish a result after deletion, a new confirmation, or another successful commit
		const updated = await transaction
			.update(topicPersonalSourceContexts)
			.set({
				processedRevision: snapshot.revision,
				encryptedContext: context.trim()
					? encryptPrivateText(context.trim().slice(0, PERSONAL_SOURCES_CONTEXT_OUTPUT_CHARS))
					: null,
				state: context.trim() ? "ready" : "empty",
				dirtySince: null,
				hasIncompleteCoverage: snapshot.hasIncompleteCoverage,
				includedEntryCount: snapshot.entryIds.length,
			})
			.where(
				and(
					eq(topicPersonalSourceContexts.topicId, snapshot.topicId),
					eq(topicPersonalSourceContexts.userId, snapshot.userId),
					eq(topicPersonalSourceContexts.revision, snapshot.revision),
					sql`${topicPersonalSourceContexts.processedRevision} < ${snapshot.revision}`,
				),
			)
			.returning({ id: topicPersonalSourceContexts.topicId })
		if (updated.length === 0) {
			return false
		}
		if (snapshot.entryIds.length > 0) {
			await transaction
				.update(personalSourceEntries)
				.set({ summarizedAt: new Date() })
				.where(
					and(
						eq(personalSourceEntries.topicId, snapshot.topicId),
						eq(personalSourceEntries.userId, snapshot.userId),
						inArray(personalSourceEntries.id, snapshot.entryIds),
					),
				)
		}
		return true
	})
}

/**
 * Reads one sender's settled private context under its current revision.
 */
export async function readPersonalSourcesContext(options: { topicId: string; userId: string }): Promise<string | null> {
	return (await loadPersonalSourcesReviewContext(options))?.text ?? null
}

/**
 * Loads one sender's exact scoring context for their private view.
 */
export async function loadPersonalSourcesReviewContext({
	topicId,
	userId,
}: {
	topicId: string
	userId: string
}): Promise<PersonalSourcesReviewContext | null> {
	const [context] = await db
		.select()
		.from(topicPersonalSourceContexts)
		.where(
			and(
				eq(topicPersonalSourceContexts.topicId, topicId),
				eq(topicPersonalSourceContexts.userId, userId),
				readyContextFilter,
			),
		)
	return context ? decodeReviewContext(context) : null
}

/**
 * Loads settled sender contexts for scoring on their destination Topic.
 */
export async function loadPersonalSourcesReviewContexts(topicId: string): Promise<PersonalSourcesReviewContext[]> {
	// read each sender independently and recheck current edit authority
	const rows = await db
		.select({ context: topicPersonalSourceContexts, topic: topics })
		.from(topicPersonalSourceContexts)
		.innerJoin(topics, eq(topics.id, topicPersonalSourceContexts.topicId))
		.where(
			and(
				eq(topicPersonalSourceContexts.topicId, topicId),
				readyContextFilter,
				toEditableTopicFilter(topicPersonalSourceContexts.userId),
			),
		)
		.orderBy(topicPersonalSourceContexts.userId)
	const contexts: PersonalSourcesReviewContext[] = []
	for (const row of rows) {
		const context = decodeReviewContext(row.context)
		if (context) {
			contexts.push(context)
		}
	}
	return contexts
}

/**
 * Checks a review input against its sender’s current revision and Topic edit authority.
 */
export async function isPersonalSourcesContextCurrent(
	version: PersonalSourcesContextVersion,
	transaction: DbHandle = db,
): Promise<boolean> {
	const [record] = await transaction
		.select({ topic: topics })
		.from(topicPersonalSourceContexts)
		.innerJoin(topics, eq(topics.id, topicPersonalSourceContexts.topicId))
		.where(
			and(
				eq(topicPersonalSourceContexts.topicId, version.topicId),
				eq(topicPersonalSourceContexts.userId, version.userId),
				eq(topicPersonalSourceContexts.revision, version.revision),
				readyContextFilter,
			),
		)
	return Boolean(record && (await isPersonalSourcesTopic({ userId: version.userId, topic: record.topic, transaction })))
}

// unsettled context never enters a private read or model request
export const readyContextFilter = and(
	eq(topicPersonalSourceContexts.state, "ready"),
	eq(topicPersonalSourceContexts.revision, topicPersonalSourceContexts.processedRevision),
)

// decrypt one sender's text after the query has fixed its identity
function decodeReviewContext(
	context: typeof topicPersonalSourceContexts.$inferSelect,
): PersonalSourcesReviewContext | null {
	const text = context.encryptedContext ? decryptPrivateText(context.encryptedContext) : null
	return text
		? {
				topicId: context.topicId,
				userId: context.userId,
				revision: context.revision,
				text,
				expiresAt: null,
				includedEntryCount: context.includedEntryCount,
				hasIncompleteCoverage: context.hasIncompleteCoverage,
			}
		: null
}

/**
 * Records a recoverable failure only for the revision whose work failed.
 */
export async function failPersonalSourcesContext({
	topicId,
	userId,
	billingUserId,
	revision,
	state,
}: {
	topicId: string
	userId: string
	billingUserId: string
	revision: number
	state: "budget" | "missing_key" | "failed"
}): Promise<boolean> {
	const updated = await db
		.update(topicPersonalSourceContexts)
		.set({ state, encryptedContext: null })
		.where(
			and(
				eq(topicPersonalSourceContexts.topicId, topicId),
				eq(topicPersonalSourceContexts.revision, revision),
				eq(topicPersonalSourceContexts.userId, userId),
				sql`${topicPersonalSourceContexts.processedRevision} < ${revision}`,
				exists(
					db
						.select({ id: topics.id })
						.from(topics)
						.where(and(eq(topics.id, topicId), eq(topics.ownerId, billingUserId), toEditableTopicFilter(userId))),
				),
			),
		)
		.returning({ revision: topicPersonalSourceContexts.revision })
	return updated.length > 0
}

/**
 * Starts a paid attempt only while the snapshot's owner, sender authority and revision are current.
 */
export async function startPersonalSourcesSummarySpend(
	snapshot: PersonalSourcesContextSnapshot,
	cost: number,
): Promise<string | null> {
	return db.transaction(async (transaction) => {
		// keep the owner stable while recording the spend, then release the lock before the model call
		const [current] = await transaction
			.select({ id: topics.id })
			.from(topics)
			.innerJoin(topicPersonalSourceContexts, eq(topicPersonalSourceContexts.topicId, topics.id))
			.where(
				and(
					eq(topics.id, snapshot.topicId),
					eq(topics.ownerId, snapshot.billingUserId),
					toEditableTopicFilter(snapshot.userId),
					eq(topicPersonalSourceContexts.userId, snapshot.userId),
					eq(topicPersonalSourceContexts.revision, snapshot.revision),
					sql`${topicPersonalSourceContexts.processedRevision} < ${snapshot.revision}`,
				),
			)
			.for("share", { of: topics })
		if (!current) {
			return null
		}
		const [spend] = await transaction
			.insert(personalSourcesSummarySpends)
			.values({
				userId: snapshot.billingUserId,
				topicId: snapshot.topicId,
				revision: snapshot.revision,
				cost,
				state: "started",
			})
			.returning({ id: personalSourcesSummarySpends.id })
		if (!spend) {
			throw new Error("Personal sources summarization could not record the attempt")
		}
		return spend.id
	})
}
