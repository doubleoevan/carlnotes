// sender-only entry pages read bounded ciphertext in newest-first order
import {
	PERSONAL_SOURCES_ITEMS_PER_PAGE,
	PERSONAL_SOURCES_PAGE_SIZE,
	PERSONAL_SOURCES_SEND_LINK_LIMIT,
	type PersonalSourceEntry,
	type PersonalSourceEntryPage,
} from "@carlnotes/contracts/personalSources"
import { MINUTE_MS } from "@carlnotes/contracts/time"
import { and, count, desc, eq, inArray, type SQL, sql } from "drizzle-orm"
import { z } from "zod"
import { isAllowed } from "./authorization"
import { db } from "./index"
import { loadPersonalSourceLinkOutcomes } from "./personalSourceLinkOutcomes"
import { PERSONAL_SOURCE_READ_BYTES, personalSourcePayloadBytes } from "./personalSourcePayloads"
import { loadTopicPersonalSources } from "./personalSources"
import { decryptPersonalSourceEntry } from "./personalSourcesLifecycle"
import { readRedisJson, saveRedisJson } from "./redis"
import { personalSourceEntries, topicPersonalSourceContexts } from "./schema/personalSources"
import { topics } from "./schema/topics"

const entryCursor = z.object({ id: z.string().min(1).max(100), receivedAt: z.iso.datetime() })
type EntryCandidate = { id: string; receivedAt: string; bytes: number }

/**
 * Loads a bounded newest-first page for the authenticated sender by cursor or page number.
 */
export async function loadPersonalSourcesEntries({
	userId,
	topicId,
	sourceId,
	cursor,
	pageNumber,
	isTitlePage = false,
}: {
	userId: string
	topicId: string
	sourceId?: string
	cursor?: string
	pageNumber?: number
	isTitlePage?: boolean
}): Promise<PersonalSourceEntryPage | "invalid_cursor" | null> {
	// authority precedes cursor inspection and every private content read
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1)
	if (!topic || !(await isAllowed(userId, "personalSources:read", topic))) {
		return null
	}
	const before = cursor ? decodeEntryCursor(cursor) : null
	if (cursor && !before) {
		return "invalid_cursor"
	}

	// resolve a displayed OAuth group only after the sender check
	const metadata = isTitlePage && sourceId ? await loadTopicPersonalSources({ userId, topicId }) : null
	const groupId = metadata?.sources.find((source) => source.id === sourceId)?.groupId
	const sourceIds = groupId
		? metadata?.sources.filter((source) => source.groupId === groupId).map((source) => source.id)
		: sourceId
			? [sourceId]
			: undefined

	// Every read is scoped to this sender and selection, including the page count.
	const scope = and(
		eq(personalSourceEntries.userId, userId),
		eq(personalSourceEntries.topicId, topicId),
		sourceIds ? inArray(personalSourceEntries.sourceId, sourceIds) : undefined,
		before ? beforeEntry(before.receivedAt, before.id) : undefined,
	)
	if (pageNumber !== undefined) {
		const selection = await selectNumberedPage(scope, Math.max(1, pageNumber), { topicId, userId, sourceIds, cursor })
		const page = await readSelectedEntries({ candidates: selection.candidates, isTitlePage })
		return { ...page, pagination: selection.pagination }
	}
	const candidates = await entryCandidates(scope, PERSONAL_SOURCES_PAGE_SIZE + 1)
	return readSelectedEntries({ candidates, isTitlePage })
}

/**
 * Reads this sender's retained send links still waiting for review in one accepted entry.
 */
export async function loadPersonalSourcesReceiptLinks({
	userId,
	topicId,
	entryId,
}: {
	userId: string
	topicId: string
	entryId: string
}): Promise<{ url: string; title?: string }[]> {
	// repeat Topic authority and sender isolation before decrypting a receipt
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1)
	if (!topic || !(await isAllowed(userId, "personalSources:read", topic))) {
		return []
	}
	const [entry] = await db
		.select()
		.from(personalSourceEntries)
		.where(
			and(
				eq(personalSourceEntries.id, entryId),
				eq(personalSourceEntries.topicId, topicId),
				eq(personalSourceEntries.userId, userId),
				eq(personalSourceEntries.origin, "send"),
			),
		)
		.limit(1)
	if (!entry) {
		return []
	}

	// reuse the Topic's durable outcomes and known page titles
	const [receiptEntry] = await loadPersonalSourceLinkOutcomes([toPersonalSourceEntry(entry)])
	const queuedLinks = receiptEntry?.linkOutcomes.filter((link) => link.status === "queued") ?? []
	const uniqueLinks = new Map(queuedLinks.map(({ url, title }) => [url, { url, title }]))
	return [...uniqueLinks.values()].slice(0, PERSONAL_SOURCES_SEND_LINK_LIMIT)
}

// Keep database microseconds intact across cursor reads and the numbered-page metadata stream.
function beforeEntry(receivedAt: string, id: string): SQL {
	return sql`(${personalSourceEntries.receivedAt}, ${personalSourceEntries.id}) < (${receivedAt}::timestamptz, ${id})`
}

function entryCandidates(scope: SQL | undefined, limit: number, offset = 0): Promise<EntryCandidate[]> {
	return db
		.select({
			id: personalSourceEntries.id,
			receivedAt: sql<string>`to_char(${personalSourceEntries.receivedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
			bytes: personalSourcePayloadBytes,
		})
		.from(personalSourceEntries)
		.where(scope)
		.orderBy(desc(personalSourceEntries.receivedAt), desc(personalSourceEntries.id))
		.limit(limit)
		.offset(offset)
}

// Ordinary sends need only a count and five IDs. Large imports keep the same size-bounded pages.
type NumberedEntryPage = {
	candidates: EntryCandidate[]
	pagination: NonNullable<PersonalSourceEntryPage["pagination"]>
}
type EntryPageScope = { topicId: string; userId: string; sourceIds?: string[]; cursor?: string }
async function selectNumberedPage(
	scope: SQL | undefined,
	requestedPage: number,
	sender: EntryPageScope,
): Promise<NumberedEntryPage> {
	const [stats] = await db
		.select({
			total: count(),
			largest: sql<number>`coalesce(max(octet_length(${personalSourceEntries.encryptedPayload})), 0)`.mapWith(Number),
		})
		.from(personalSourceEntries)
		.where(scope)
	const totalEntryCount = stats?.total ?? 0
	if ((stats?.largest ?? 0) * PERSONAL_SOURCES_ITEMS_PER_PAGE <= PERSONAL_SOURCE_READ_BYTES) {
		const pageCount = Math.max(1, Math.ceil(totalEntryCount / PERSONAL_SOURCES_ITEMS_PER_PAGE))
		const pageNumber = Math.min(Math.max(1, requestedPage), pageCount)
		const entryOffset = (pageNumber - 1) * PERSONAL_SOURCES_ITEMS_PER_PAGE
		const candidates = await entryCandidates(scope, PERSONAL_SOURCES_ITEMS_PER_PAGE, entryOffset)
		return { candidates, pagination: { pageNumber, pageCount, entryOffset, totalEntryCount } }
	}

	// a new receipt or deletion changes this sender's revision, so every later poll can reuse only current page offsets
	const [context] = await db
		.select({ revision: topicPersonalSourceContexts.revision })
		.from(topicPersonalSourceContexts)
		.where(
			and(
				eq(topicPersonalSourceContexts.topicId, sender.topicId),
				eq(topicPersonalSourceContexts.userId, sender.userId),
			),
		)
	const key = context
		? `personal-source-pages:${JSON.stringify([sender.topicId, sender.userId, sender.sourceIds?.toSorted(), sender.cursor, context.revision, totalEntryCount])}`
		: null
	const offsets = (key && (await readRedisJson<number[]>(key))) || (await loadPageOffsets(scope, key))
	const pageNumber = Math.min(requestedPage, offsets.length)
	const entryOffset = offsets[pageNumber - 1] ?? 0
	const limit = Math.min(PERSONAL_SOURCES_ITEMS_PER_PAGE, (offsets[pageNumber] ?? totalEntryCount) - entryOffset)
	const candidates = await entryCandidates(scope, Math.max(0, limit), entryOffset)
	return { candidates, pagination: { pageNumber, pageCount: offsets.length, entryOffset, totalEntryCount } }
}

// cache only row offsets for mixed-size histories. Contents, links and sender names stay out of Redis.
async function loadPageOffsets(scope: SQL | undefined, key: string | null): Promise<number[]> {
	const offsets = [0]
	let seen = 0
	let bytes = 0
	let countOnPage = 0
	for await (const entry of streamEntryCandidates(scope)) {
		if (
			countOnPage === PERSONAL_SOURCES_ITEMS_PER_PAGE ||
			(countOnPage > 0 && bytes + entry.bytes > PERSONAL_SOURCE_READ_BYTES)
		) {
			offsets.push(seen)
			countOnPage = 0
			bytes = 0
		}
		countOnPage += 1
		seen += 1
		bytes += entry.bytes
	}
	if (key) {
		await saveRedisJson({ key, value: offsets, ttlMs: 15 * MINUTE_MS })
	}
	return offsets
}

// Keyset pages keep metadata transfer bounded even when a permanent import contains thousands of items.
async function* streamEntryCandidates(scope: SQL | undefined): AsyncGenerator<EntryCandidate> {
	let cursor: EntryCandidate | undefined
	for (;;) {
		const batch = await entryCandidates(and(scope, cursor ? beforeEntry(cursor.receivedAt, cursor.id) : undefined), 512)
		yield* batch
		if (batch.length < 512) {
			return
		}
		cursor = batch.at(-1)
	}
}

// cursor values are opaque paging positions, never authorization tokens
function decodeEntryCursor(cursor: string): z.infer<typeof entryCursor> | null {
	try {
		return entryCursor.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")))
	} catch {
		return null
	}
}

// take at least one entry, then stop before the next entry would exceed the page budget
async function readSelectedEntries({
	candidates,
	isTitlePage,
}: {
	candidates: EntryCandidate[]
	isTitlePage: boolean
}): Promise<PersonalSourceEntryPage> {
	const selected: typeof candidates = []
	let selectedBytes = 0
	for (const candidate of candidates) {
		if (
			selected.length >= PERSONAL_SOURCES_PAGE_SIZE ||
			(selected.length > 0 && selectedBytes + candidate.bytes > PERSONAL_SOURCE_READ_BYTES)
		) {
			break
		}
		selected.push(candidate)
		selectedBytes += candidate.bytes
	}
	if (selected.length === 0) {
		return { entries: [], nextCursor: null }
	}

	// Fetch ciphertext only for the selected IDs still present after pagination.
	const rows = await db
		.select()
		.from(personalSourceEntries)
		.where(
			inArray(
				personalSourceEntries.id,
				selected.map((entry) => entry.id),
			),
		)
		.orderBy(desc(personalSourceEntries.receivedAt), desc(personalSourceEntries.id))
	const lastEntry = selected.at(-1)
	const nextCursor =
		candidates.length > selected.length && lastEntry
			? Buffer.from(JSON.stringify({ id: lastEntry.id, receivedAt: lastEntry.receivedAt })).toString("base64url")
			: null
	const entries = rows.map(toPersonalSourceEntry)
	return { entries: isTitlePage ? entries : await loadPersonalSourceLinkOutcomes(entries), nextCursor }
}

// a missing key or damaged ciphertext fails the page without returning partial private text
function toPersonalSourceEntry(entry: typeof personalSourceEntries.$inferSelect): PersonalSourceEntry {
	const payload = decryptPersonalSourceEntry(entry.encryptedPayload)
	if (!payload) {
		throw new Error("Personal sources content is temporarily unavailable")
	}
	return {
		...payload,
		id: entry.id,
		sourceId: entry.sourceId,
		topicId: entry.topicId,
		origin: entry.origin,
		receivedAt: entry.receivedAt.toISOString(),
		expiresAt: null,
		summarizedAt: entry.summarizedAt?.toISOString() ?? null,
		omittedLinkCount: entry.omittedLinkCount,
		linkOutcomes: [],
	}
}
