// atomic confirmation: current identity, allowance, personal authority, and encrypted persistence
import {
	type AiAgentSourceConfig,
	PERSONAL_SOURCES_DAILY_SEND_LIMIT,
	type PersonalSourceEntryPayload,
	type PersonalSourcesSendResult,
} from "@carlnotes/contracts/personalSources"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { DAY_MS, toUtcDay } from "@carlnotes/contracts/time"
import { appUrl } from "@carlnotes/server/appUrl"
import { toAuthSecretSignature } from "@carlnotes/server/hmac"
import { encryptPrivateText } from "@carlnotes/server/privateText"
import { and, countDistinct, eq, ne, sql } from "drizzle-orm"
import { type DbTransaction, db } from "./index"
import { decidePersonalSourcesCapability } from "./personalSourcesAuthority"
import { decryptPersonalSourceEntry, invalidatePersonalSourcesContext } from "./personalSourcesLifecycle"
import { toPersonalSourcesLinkFingerprint } from "./personalSourcesLinkQueue"
import { lockPersonalSourcesSender, lockPersonalSourcesTopic } from "./personalSourcesLocks"
import { readPersonalSourcesDailyCount } from "./personalSourcesQuota"
import {
	personalSourceEntries,
	personalSourcesDailyCounts,
	personalSourcesDeliveries,
	personalSourcesLinks,
	topicPersonalSourceContexts,
} from "./schema/personalSources"
import { sources, type topics } from "./schema/topics"
import { users } from "./schema/users"

// authenticated adapters supply the delivery identity
export type ReceivePersonalSourceEntryOptions = {
	// who sent the delivery, to which Topic, and how it arrived
	userId: string
	topicId: string
	senderIdentity: string
	requestId: string
	origin: "send" | "email" | "import"
	// the entry and the source it files under
	config: AiAgentSourceConfig | Record<string, never>
	payload: PersonalSourceEntryPayload
	omittedLinkCount?: number
	existingSourceId?: string
	// a send to several Topics, or one conversation of an import
	sendBatch?: { topicIds: string[]; isFirstTopic: boolean }
	importBatch?: { topic?: typeof topics.$inferSelect; sourceId?: string }
	// the adapter's check, under the sender's lock, that the sender is still connected
	authorizeSender: (transaction: DbTransaction) => Promise<boolean>
}

/**
 * Accepts one encrypted delivery with its quota and retry record in the same transaction.
 */
export async function receivePersonalSourceEntry(
	options: ReceivePersonalSourceEntryOptions,
	transaction?: DbTransaction,
): Promise<PersonalSourcesSendResult> {
	if (transaction) {
		return receiveLockedPersonalSourceEntry(transaction, options)
	}
	return db.transaction((lockedTransaction) => receiveLockedPersonalSourceEntry(lockedTransaction, options))
}

// revocation and confirmation share this user's lock, including every conversation in an atomic import
async function receiveLockedPersonalSourceEntry(
	transaction: DbTransaction,
	options: ReceivePersonalSourceEntryOptions,
): Promise<PersonalSourcesSendResult> {
	// a sender whose connection is gone gets a disconnected result
	if (
		(!options.importBatch?.topic && !(await lockPersonalSourcesSender(transaction, options.userId))) ||
		!(await options.authorizeSender(transaction))
	) {
		return { status: "disconnected" }
	}
	return acceptIdentifiedEntry(transaction, options)
}

// allowance is inspected before looking up the target Topic
async function acceptIdentifiedEntry(
	transaction: DbTransaction,
	options: ReceivePersonalSourceEntryOptions,
): Promise<PersonalSourcesSendResult> {
	const { userId, senderIdentity, requestId, origin } = options
	const [priorDelivery] = await transaction
		.select()
		.from(personalSourcesDeliveries)
		.where(
			and(
				eq(personalSourcesDeliveries.userId, userId),
				eq(personalSourcesDeliveries.senderIdentity, senderIdentity),
				eq(personalSourcesDeliveries.requestId, requestId),
			),
		)
		.limit(1)
	// read the database clock
	const [clock] = await transaction
		.select({ now: sql<string>`clock_timestamp()::text` })
		.from(users)
		.where(eq(users.id, userId))
	const now = new Date(clock?.now ?? "")
	if (!Number.isFinite(now.getTime())) {
		throw new Error("Personal sources confirmation requires the database clock")
	}

	// an accepted retry bypasses a fresh allowance but still requires current Topic authority
	const day = toUtcDay(now)

	// a new delivery needs the day's allowance
	if (
		!priorDelivery &&
		options.sendBatch?.isFirstTopic !== false &&
		origin !== "import" &&
		!(await hasPersonalSourcesAllowance(transaction, { userId, day }))
	) {
		return { status: "quota", resetAt: new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString() }
	}

	// the Topic must exist
	const topic = options.importBatch?.topic ?? (await lockPersonalSourcesTopic(transaction, options.topicId))
	if (!topic) {
		return { status: "not_found" }
	}

	// the sender must hold the capability for this origin
	const capability =
		origin === "email"
			? "personalSources:email"
			: origin === "import"
				? "personalSources:import"
				: "personalSources:send"

	// a sender without the capability gets the same result as a missing Topic
	if (!(await decidePersonalSourcesCapability({ userId, capability, topic, transaction }))) {
		return { status: "not_found" }
	}

	// an import's later entries reuse the locked Topic
	if (options.importBatch) {
		options.importBatch.topic = topic
	}

	// preserve retry identity independently of deleted content
	const payloadDigest = toPersonalSourcesPayloadDigest(options)
	if (priorDelivery) {
		return replayPersonalSourcesDelivery(transaction, { priorDelivery, payloadDigest, topic })
	}
	return persistPersonalSourceEntry(transaction, { ...options, now, day, payloadDigest, topic })
}

// the user's lock makes this check and the eventual increment one acceptance reservation
async function hasPersonalSourcesAllowance(
	transaction: DbTransaction,
	{ userId, day }: { userId: string; day: string },
): Promise<boolean> {
	return (await readPersonalSourcesDailyCount({ userId, day, transaction })) < PERSONAL_SOURCES_DAILY_SEND_LIMIT
}

// encrypted content and queue metadata enter storage only after every acceptance check
async function persistPersonalSourceEntry(
	transaction: DbTransaction,
	options: ReceivePersonalSourceEntryOptions & {
		now: Date
		day: string
		payloadDigest: string
		topic: typeof topics.$inferSelect
	},
): Promise<PersonalSourcesSendResult> {
	const encryptedPayload = encryptPrivateText(JSON.stringify(options.payload))
	const topicSource = options.importBatch?.sourceId
		? { id: options.importBatch.sourceId }
		: await resolvePersonalSource(transaction, options)
	if (!topicSource) {
		return { status: "not_found" }
	}

	// activation remains after every entry and Source has gone
	await transaction
		.insert(topicPersonalSourceContexts)
		.values({ topicId: options.topicId, userId: options.userId, publicOutputsVersion: 1 })
		.onConflictDoNothing()
	const [entry] = await transaction
		.insert(personalSourceEntries)
		.values({
			sourceId: topicSource.id,
			topicId: options.topicId,
			userId: options.userId,
			origin: options.origin,
			encryptedPayload,
			omittedLinkCount: options.omittedLinkCount ?? 0,
			receivedAt: options.now,
		})
		.returning({ id: personalSourceEntries.id })
	if (!entry) {
		throw new Error("Personal sources entry insertion returned no id")
	}
	await persistPersonalSourcesLinks(transaction, entry.id, options.payload.links)
	// an import transaction changes this sender's revision once, on its first new entry
	if (!options.importBatch?.sourceId) {
		await invalidatePersonalSourcesContext(transaction, { topicId: options.topicId, userId: options.userId })
	}
	if (options.importBatch) {
		options.importBatch.sourceId = topicSource.id
	}
	await chargePersonalSourcesConfirmation(transaction, options)

	// count distinct waiting links without copying their plaintext into retry metadata
	const queuedLinkCount =
		options.origin === "import"
			? 0
			: await countWaitingPersonalSourcesLinks(transaction, {
					topicId: options.topicId,
					userId: options.userId,
				})
	await transaction.insert(personalSourcesDeliveries).values({
		userId: options.userId,
		topicId: options.topicId,
		senderIdentity: options.senderIdentity,
		requestId: options.requestId,
		payloadDigest: options.payloadDigest,
		entryId: entry.id,
		queuedLinkCount,
	})
	return toPersonalSourcesConfirmation({
		topic: options.topic,
		entryId: entry.id,
		title: options.payload.title,
		queuedLinkCount,
	})
}

// an existing provider confirmation must never recreate a removed Source
async function resolvePersonalSource(
	transaction: DbTransaction,
	options: ReceivePersonalSourceEntryOptions,
): Promise<{ id: string } | undefined> {
	const [topicSource] = await transaction
		.select({ id: sources.id })
		.from(sources)
		.where(
			and(
				eq(sources.topicId, options.topicId),
				eq(sources.personalSourcesUserId, options.userId),
				options.existingSourceId
					? eq(sources.id, options.existingSourceId)
					: eq(sources.personalSourcesIdentity, options.senderIdentity),
			),
		)
		.limit(1)
	if (topicSource || options.existingSourceId) {
		return topicSource
	}
	const [createdSource] = await transaction
		.insert(sources)
		.values({
			topicId: options.topicId,
			kind: options.origin === "email" ? "email" : "ai_agent",
			config: options.config,
			personalSourcesIdentity: options.senderIdentity,
			personalSourcesUserId: options.userId,
			status: "ready",
		})
		.returning({ id: sources.id })
	return createdSource
}

// queue rows identify encrypted links by position and a keyed fingerprint
async function persistPersonalSourcesLinks(
	transaction: DbTransaction,
	entryId: string,
	links: string[],
): Promise<void> {
	if (links.length === 0) {
		return
	}
	await transaction
		.insert(personalSourcesLinks)
		.values(
			links.map((url, position) => ({
				entryId,
				position,
				fingerprint: toPersonalSourcesLinkFingerprint(url),
			})),
		)
		.onConflictDoNothing()
}

// charge accepted sends and mail only, preserving consumption after deletion
async function chargePersonalSourcesConfirmation(
	transaction: DbTransaction,
	options: ReceivePersonalSourceEntryOptions & { day: string },
): Promise<void> {
	if (options.origin === "import" || options.sendBatch?.isFirstTopic === false) {
		return
	}
	await transaction
		.insert(personalSourcesDailyCounts)
		.values({ userId: options.userId, day: options.day, kind: options.origin, acceptedCount: 1 })
		.onConflictDoUpdate({
			target: [personalSourcesDailyCounts.userId, personalSourcesDailyCounts.day, personalSourcesDailyCounts.kind],
			set: { acceptedCount: sql`${personalSourcesDailyCounts.acceptedCount} + 1` },
		})
}

// replay only entries the sender still retains
async function replayPersonalSourcesDelivery(
	transaction: DbTransaction,
	{
		priorDelivery,
		payloadDigest,
		topic,
	}: {
		priorDelivery: typeof personalSourcesDeliveries.$inferSelect
		payloadDigest: string
		topic: typeof topics.$inferSelect
	},
): Promise<PersonalSourcesSendResult> {
	// a retry with another payload or topic conflicts
	if (priorDelivery.payloadDigest !== payloadDigest || priorDelivery.topicId !== topic.id) {
		return { status: "conflict", reason: "retry_mismatch" }
	}

	// the entry the first delivery stored
	const [entry] = await transaction
		.select({ encryptedPayload: personalSourceEntries.encryptedPayload })
		.from(personalSourceEntries)
		.where(and(eq(personalSourceEntries.id, priorDelivery.entryId)))

	// an entry the sender removed conflicts, and a retained one returns the first delivery's confirmation
	const payload = entry ? decryptPersonalSourceEntry(entry.encryptedPayload) : null
	if (!payload) {
		return { status: "conflict", reason: "removed" }
	}
	return toPersonalSourcesConfirmation({
		topic,
		entryId: priorDelivery.entryId,
		title: payload.title,
		queuedLinkCount: priorDelivery.queuedLinkCount,
	})
}

// bind a retry digest to the complete accepted content and destination
function toPersonalSourcesPayloadDigest(options: ReceivePersonalSourceEntryOptions): string {
	return toAuthSecretSignature({
		value: JSON.stringify([
			options.topicId,
			options.origin,
			options.payload.title,
			options.payload.text,
			options.payload.sender,
			options.payload.senderKind,
			options.payload.links,
			options.payload.chatUrl,
			...(options.sendBatch ? [options.sendBatch.topicIds] : []),
		]),
		purpose: "personal sources retries",
		encoding: "hex",
	})
}

/**
 * Counts distinct live URLs still waiting for a durable review outcome.
 */
export async function countWaitingPersonalSourcesLinks(
	transaction: DbTransaction,
	{ topicId, userId }: { topicId: string; userId: string },
): Promise<number> {
	const [linkCount] = await transaction
		.select({ count: countDistinct(personalSourcesLinks.fingerprint) })
		.from(personalSourcesLinks)
		.innerJoin(personalSourceEntries, eq(personalSourceEntries.id, personalSourcesLinks.entryId))
		.where(
			and(
				eq(personalSourceEntries.topicId, topicId),
				eq(personalSourceEntries.userId, userId),

				ne(personalSourcesLinks.state, "considered"),
			),
		)
	return linkCount?.count ?? 0
}

// cards and text share a confirmation without private transcript or chat-reference fields
function toPersonalSourcesConfirmation({
	topic,
	entryId,
	title,
	queuedLinkCount,
}: {
	topic: typeof topics.$inferSelect
	entryId: string
	title: string
	queuedLinkCount: number
}): PersonalSourcesSendResult {
	return {
		status: "accepted",
		topic: { id: topic.id, name: topic.name, url: `${appUrl()}${toTopicPath(topic)}` },
		entryId,
		title,
		queuedLinkCount,
	}
}
