// live database checks cover actual locks, retry tombstones, retention, and composite constraints
import { isAdminRole } from "@carlnotes/contracts/enums"
import { PERSONAL_SOURCES_DAILY_SEND_LIMIT, PERSONAL_SOURCES_PAGE_SIZE } from "@carlnotes/contracts/personalSources"
import type { Plan } from "@carlnotes/contracts/plans"
import { db } from "@carlnotes/db"
import { loadPersonalSourcesEntries } from "@carlnotes/db/personalSourceEntries"
import { deletePersonalSource, deletePersonalSourceEntry } from "@carlnotes/db/personalSourcesLifecycle"
import { assertPersonalSourcesConverted, lockPersonalSourcesTopic } from "@carlnotes/db/personalSourcesLocks"
import { readPersonalSourcesAllowance } from "@carlnotes/db/personalSourcesQuota"
import { receivePersonalSourceEntry } from "@carlnotes/db/personalSourcesReceive"
import {
	personalSourceEntries,
	personalSourcesDailyCounts,
	personalSourcesLinks,
	topicPersonalSourceContexts,
} from "@carlnotes/db/schema/personalSources"
import { sources, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { count, eq, inArray, sql } from "drizzle-orm"
import {
	checkPersonalSources,
	personalSourcesSmokeDelivery,
	seedPersonalSourcesTopic,
} from "./personalSourcesSmokeFixtures"

/**
 * Checks accepted-only UTC plan counters, shared pools, retries, and deletion without refunds.
 */
export async function checkPersonalSourcesQuotaPersistence(): Promise<void> {
	for (const [account, plan] of [
		["free", "free"],
		["plus", "plus"],
		["premium", "premium"],
		["admin", "free"],
	] satisfies [string, Plan][]) {
		const topic = await seedPersonalSourcesTopic(`quota-${account}`, plan)
		if (isAdminRole(account)) {
			await db.update(users).set({ role: "admin" }).where(eq(users.id, topic.userId))
		}
		const allowance = await readPersonalSourcesAllowance({ userId: topic.userId })
		const limit = PERSONAL_SOURCES_DAILY_SEND_LIMIT
		await db
			.insert(personalSourcesDailyCounts)
			.values({ userId: topic.userId, day: allowance.day, kind: "send", acceptedCount: limit - 2 })
		const requests = Array.from({ length: 4 }, (_, index) =>
			personalSourcesSmokeDelivery(topic, `race-${index}`, `agent-${index % 2}`),
		)
		for (const [index, request] of requests.entries()) {
			if (index % 2 === 1) {
				request.senderIdentity = "api_key:synthetic-key"
				request.config = { delivery: "api_key", apiKeyId: "synthetic-key" }
			}
		}
		const results = await Promise.all(requests.map((request) => receivePersonalSourceEntry(request)))
		checkPersonalSources(
			`${account} accepts exactly two concurrent sends at its ${limit} limit`,
			results.filter((result) => result.status === "accepted").length === 2 &&
				results.filter((result) => result.status === "quota").length === 2,
		)

		// a live retry bypasses the spent allowance, but a removed entry never comes back
		const acceptedIndex = results.findIndex((result) => result.status === "accepted")
		const accepted = results[acceptedIndex]
		const request = requests[acceptedIndex]
		if (!request || accepted?.status !== "accepted") {
			throw new Error("Missing accepted quota fixture")
		}
		checkPersonalSources(
			`${account} returns the original receipt on retry`,
			JSON.stringify(await receivePersonalSourceEntry(request)) === JSON.stringify(accepted),
		)
		await deletePersonalSourceEntry({ ...topic, entryId: accepted.entryId })
		const replay = await receivePersonalSourceEntry(request)
		checkPersonalSources(
			`${account} replay after deletion cannot recreate content`,
			replay.status === "conflict" && replay.reason === "removed",
		)
		checkPersonalSources(
			`${account} deletion does not refund quota`,
			!(await readPersonalSourcesAllowance({ userId: topic.userId })).isAvailable,
		)
	}
}

/**
 * Checks first-receipt Source uniqueness, the shared cap, ciphertext, and cascading cleanup.
 */
export async function checkPersonalSourcePersistence(): Promise<void> {
	const topic = await seedPersonalSourcesTopic("source-race")
	const results = await Promise.all(
		Array.from({ length: 4 }, (_, index) =>
			receivePersonalSourceEntry(personalSourcesSmokeDelivery(topic, `source-${index}`)),
		),
	)
	const sourceRows = await db.select().from(sources).where(eq(sources.topicId, topic.topicId))
	checkPersonalSources(
		"concurrent first sends create one concrete Source",
		results.every((result) => result.status === "accepted") && sourceRows.length === 1,
	)
	const entries = await db.select().from(personalSourceEntries).where(eq(personalSourceEntries.topicId, topic.topicId))
	checkPersonalSources(
		"received content is ciphertext only",
		entries.every(
			(entry) => entry.encryptedPayload.startsWith("enc1:") && !entry.encryptedPayload.includes("Synthetic private"),
		),
	)
	const firstSource = sourceRows[0]
	if (!firstSource) {
		throw new Error("Missing Source fixture")
	}
	await deletePersonalSource({ ...topic, sourceId: firstSource.id })
	await deletePersonalSource({ ...topic, sourceId: firstSource.id })
	const [activation] = await db
		.select()
		.from(topicPersonalSourceContexts)
		.where(eq(topicPersonalSourceContexts.topicId, topic.topicId))
	const remaining = await db
		.select({ count: count() })
		.from(personalSourceEntries)
		.where(eq(personalSourceEntries.topicId, topic.topicId))
	checkPersonalSources(
		"repeated Source deletion leaves activation but removes entries",
		Boolean(activation) && remaining[0]?.count === 0,
	)
	checkPersonalSources(
		"deleted entries remove their link claims",
		(
			await db
				.select({ count: count() })
				.from(personalSourcesLinks)
				.where(
					inArray(
						personalSourcesLinks.entryId,
						entries.map((entry) => entry.id),
					),
				)
		)[0]?.count === 0,
	)

	// receiving Sources do not consume fetched capacity, including on the first send to a full Topic
	const fullTopic = await seedPersonalSourcesTopic("full-source")
	await db.insert(sources).values(
		Array.from({ length: 10 }, () => ({
			topicId: fullTopic.topicId,
			kind: "rss" as const,
			config: {},
			status: "ready" as const,
		})),
	)
	const accepted = await receivePersonalSourceEntry(personalSourcesSmokeDelivery(fullTopic, "full"))
	checkPersonalSources(
		"a Topic with ten fetched Sources accepts its first personal sources send",
		accepted.status === "accepted",
	)
	checkPersonalSources(
		"the full Topic receives an eleventh Source and charges one accepted send",
		(await db.select().from(sources).where(eq(sources.topicId, fullTopic.topicId))).length === 11 &&
			(
				await db
					.select()
					.from(personalSourcesDailyCounts)
					.where(eq(personalSourcesDailyCounts.userId, fullTopic.userId))
			).length === 1,
	)
}

/**
 * Keeps old encrypted entries readable and idempotent until explicit deletion.
 */
export async function checkPersonalSourcesRetentionPersistence(): Promise<void> {
	const topic = await seedPersonalSourcesTopic("retention")
	const request = personalSourcesSmokeDelivery(topic, "retention")
	const result = await receivePersonalSourceEntry(request)
	if (result.status !== "accepted") {
		throw new Error("Retention fixture was not accepted")
	}

	// age the receipt without changing its encrypted content or delivery identity
	await db
		.update(personalSourceEntries)
		.set({ receivedAt: sql`statement_timestamp() - interval '365 days'` })
		.where(eq(personalSourceEntries.id, result.entryId))
	const page = await loadPersonalSourcesEntries(topic)
	checkPersonalSources(
		"year-old encrypted sends remain readable without expiry",
		page !== null &&
			page !== "invalid_cursor" &&
			page.entries[0]?.id === result.entryId &&
			page.entries[0]?.expiresAt === null,
	)
	const replay = await receivePersonalSourceEntry(request)
	checkPersonalSources(
		"an old delivery retry returns the same retained entry",
		replay.status === "accepted" && replay.entryId === result.entryId,
	)
	const [stored] = await db.select().from(personalSourceEntries).where(eq(personalSourceEntries.id, result.entryId))
	checkPersonalSources(
		"retained private payload stays encrypted",
		Boolean(stored?.encryptedPayload.startsWith("enc1:")),
	)

	// explicit deletion still removes content while preserving its replay tombstone
	await deletePersonalSourceEntry({ ...topic, entryId: result.entryId })
	const removedRetry = await receivePersonalSourceEntry(request)
	checkPersonalSources(
		"deleted retained content is not recreated by retry",
		removedRetry.status === "conflict" && removedRetry.reason === "removed",
	)
	checkPersonalSources(
		"deletion preserves the lasting activation marker",
		(await db.select().from(topicPersonalSourceContexts).where(eq(topicPersonalSourceContexts.topicId, topic.topicId)))
			.length === 1,
	)
}

/**
 * Preserves every item when PostgreSQL timestamps share a microsecond-precision paging boundary.
 */
export async function checkPersonalSourcesEntryPagination(): Promise<void> {
	// Real receipts retain valid ciphertext while the database supplies sub-millisecond timestamps.
	const topic = await seedPersonalSourcesTopic("entry-pagination")
	const expectedIds: string[] = []
	for (let index = 0; index < PERSONAL_SOURCES_PAGE_SIZE + 2; index += 1) {
		const result = await receivePersonalSourceEntry(personalSourcesSmokeDelivery(topic, `page-${index}`))
		if (result.status !== "accepted") {
			throw new Error("Pagination fixture was not accepted")
		}
		expectedIds.push(result.entryId)
	}
	await db
		.update(personalSourceEntries)
		.set({ receivedAt: sql`'2026-11-01T12:00:00.123456Z'::timestamptz` })
		.where(eq(personalSourceEntries.topicId, topic.topicId))

	// Equal timestamps must use the ID tie-break on both sides of the cursor.
	const first = await loadPersonalSourcesEntries(topic)
	if (!first || first === "invalid_cursor" || !first.nextCursor) {
		throw new Error("Pagination fixture did not produce a second page")
	}
	const second = await loadPersonalSourcesEntries({ ...topic, cursor: first.nextCursor })
	if (!second || second === "invalid_cursor") {
		throw new Error("Precision-preserving cursor was rejected")
	}
	const actualIds = [...first.entries, ...second.entries].map((entry) => entry.id)
	checkPersonalSources(
		"microsecond timestamp cursors preserve every entry without skips or duplicates",
		JSON.stringify(actualIds) === JSON.stringify(expectedIds.toSorted().reverse()) && second.nextCursor === null,
	)
	checkPersonalSources(
		"entry cursors preserve all six database fractional digits",
		JSON.parse(Buffer.from(first.nextCursor, "base64url").toString("utf8")).receivedAt ===
			"2026-11-01T12:00:00.123456Z",
	)
}

/**
 * Races publication with first receipt while keeping private content sender-scoped.
 */
export async function checkPersonalSourcesPublicationRace(): Promise<void> {
	const topic = await seedPersonalSourcesTopic("publish-race")
	const publish = db
		.transaction(async (transaction) => {
			await lockPersonalSourcesTopic(transaction, topic.topicId)
			await assertPersonalSourcesConverted(transaction, topic.topicId)
			await transaction.update(topics).set({ visibility: "public" }).where(eq(topics.id, topic.topicId))
			return true
		})
		.catch(() => false)
	const [published, received] = await Promise.all([
		publish,
		receivePersonalSourceEntry(personalSourcesSmokeDelivery(topic, "publish-race")),
	])
	checkPersonalSources("publication and first receipt both succeed", published && received.status === "accepted")
	const [storedTopic] = await db.select().from(topics).where(eq(topics.id, topic.topicId))
	const [activation] = await db
		.select()
		.from(topicPersonalSourceContexts)
		.where(eq(topicPersonalSourceContexts.topicId, topic.topicId))
	checkPersonalSources(
		"publication preserves the sender context independently of visibility",
		activation?.userId === topic.userId && storedTopic?.visibility === "public",
	)
}
