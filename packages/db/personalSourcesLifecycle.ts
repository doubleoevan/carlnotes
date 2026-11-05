import { personalSourceKinds } from "@carlnotes/contracts/enums"
// sender deletion and revision invalidation share one lifecycle
import { type PersonalSourceEntryPayload, personalSourceEntryPayload } from "@carlnotes/contracts/personalSources"
import { decryptPrivateText } from "@carlnotes/server/privateText"
import { and, eq, inArray, sql } from "drizzle-orm"
import { type DbTransaction, db } from "./index"
import { decidePersonalSourcesCapability } from "./personalSourcesAuthority"
import { lockPersonalSourcesTopic } from "./personalSourcesLocks"
import {
	findingPersonalAnnotations,
	personalSourceEntries,
	topicPersonalSourceContexts,
} from "./schema/personalSources"
import { sources } from "./schema/topics"

/**
 * Reads an authenticated payload without allowing plaintext or malformed stored content.
 */
export function decryptPersonalSourceEntry(encryptedPayload: string): PersonalSourceEntryPayload | null {
	const plainText = decryptPrivateText(encryptedPayload)
	if (plainText === null) {
		return null
	}
	try {
		return personalSourceEntryPayload.parse(JSON.parse(plainText))
	} catch {
		return null
	}
}

/**
 * Invalidates derived context atomically with an entry or Source mutation.
 */
export async function invalidatePersonalSourcesContext(
	transaction: DbTransaction,
	{ topicId, userId }: { topicId: string; userId: string },
): Promise<void> {
	await transaction
		.update(topicPersonalSourceContexts)
		.set({
			revision: sql`${topicPersonalSourceContexts.revision} + 1`,
			encryptedContext: null,
			state: "pending",
			hasIncompleteCoverage: false,
			dirtySince: sql`coalesce(${topicPersonalSourceContexts.dirtySince}, clock_timestamp())`,
		})
		.where(and(eq(topicPersonalSourceContexts.topicId, topicId), eq(topicPersonalSourceContexts.userId, userId)))
	await transaction
		.delete(findingPersonalAnnotations)
		.where(and(eq(findingPersonalAnnotations.topicId, topicId), eq(findingPersonalAnnotations.userId, userId)))
}

/**
 * Deletes one sender's entry and invalidates every context built from its prior revision.
 */
export async function deletePersonalSourceEntry({
	userId,
	topicId,
	entryId,
}: {
	userId: string
	topicId: string
	entryId: string
}): Promise<boolean> {
	return db.transaction(async (transaction) => {
		// serialize deletion with receipt and context commits
		const topic = await lockPersonalSourcesTopic(transaction, topicId)
		if (
			!topic ||
			!(await decidePersonalSourcesCapability({ userId, capability: "personalSources:delete", topic, transaction }))
		) {
			return false
		}

		// repeated deletion succeeds without advancing an unchanged revision
		const deletedEntries = await transaction
			.delete(personalSourceEntries)
			.where(
				and(
					eq(personalSourceEntries.id, entryId),
					eq(personalSourceEntries.topicId, topicId),
					eq(personalSourceEntries.userId, userId),
				),
			)
			.returning({ id: personalSourceEntries.id })
		if (deletedEntries.length > 0) {
			await invalidatePersonalSourcesContext(transaction, { topicId, userId })
		}
		return true
	})
}

/**
 * Removes one sender's receiving Source, its entries, links, and pending replies.
 */
export async function deletePersonalSource({
	userId,
	topicId,
	sourceId,
}: {
	userId: string
	topicId: string
	sourceId: string
}): Promise<boolean> {
	return db.transaction(async (transaction) => {
		// authorize explicit removal while holding the same lock as acceptance
		const topic = await lockPersonalSourcesTopic(transaction, topicId)
		if (
			!topic ||
			!(await decidePersonalSourcesCapability({ userId, capability: "personalSources:delete", topic, transaction }))
		) {
			return false
		}

		// parent cascades remove entries, queue claims, and pending reply snapshots
		const deletedSources = await transaction
			.delete(sources)
			.where(
				and(
					eq(sources.id, sourceId),
					eq(sources.topicId, topicId),
					eq(sources.personalSourcesUserId, userId),
					inArray(sources.kind, personalSourceKinds),
				),
			)
			.returning({ id: sources.id })
		if (deletedSources.length > 0) {
			await invalidatePersonalSourcesContext(transaction, { topicId, userId })
		}
		return true
	})
}
