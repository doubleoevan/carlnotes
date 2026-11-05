// durable shared-address receipts retain retry identity without retaining received message bodies
import {
	type PersonalSourcesEmailReply,
	type PersonalSourcesEmailTopicChoice,
	personalSourcesEmailTopicChoices,
	type ReceivedEmailEvent,
} from "@carlnotes/contracts/personalSourcesEmail"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { appUrl } from "@carlnotes/server/appUrl"
import { toAuthSecretSignature } from "@carlnotes/server/hmac"
import { toEmailSenderAddress } from "@carlnotes/server/personalSourcesEmailContent"
import {
	isPersonalSourcesEmailEnabled,
	readPersonalSourcesEmailAddress,
} from "@carlnotes/server/personalSourcesSettings"
import { decryptPrivateText, encryptPrivateText } from "@carlnotes/server/privateText"
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm"
import { z } from "zod"
import { type DbHandle, type DbTransaction, db } from "./index"
import {
	personalSourcesEmailChoices,
	personalSourcesEmailReceipts,
	personalSourcesEmailReplies,
} from "./schema/personalSources"
import { topics } from "./schema/topics"
import { users } from "./schema/users"
import { toEditableTopicFilter } from "./topicPermissions"

// earlier choices included display names and links. Both encodings preserve the order shown to the sender.
const storedChoiceIds = z.union([
	z.array(z.string().min(1)).max(5),
	personalSourcesEmailTopicChoices.transform((choices) => choices.map(({ id }) => id)),
])

/**
 * Saves numbered Topic choices without copying the email's subject or body.
 */
export async function savePersonalSourcesEmailChoices(
	transaction: DbTransaction,
	choices: {
		receiptId: string
		userId: string
		topics: PersonalSourcesEmailTopicChoice[]
		messageId: string
	},
): Promise<void> {
	await transaction
		.insert(personalSourcesEmailChoices)
		.values({
			receiptId: choices.receiptId,
			userId: choices.userId,
			messageId: choices.messageId,
			encryptedTopics: encryptPrivateText(JSON.stringify(choices.topics.map(({ id }) => id))),
		})
		.onConflictDoNothing()
}

/**
 * Removes a completed choice list and its sender binding in the filing transaction.
 */
export async function retirePersonalSourcesEmailChoices(transaction: DbTransaction, receiptId: string): Promise<void> {
	// settle the original receipt before deleting its choices, in the same lock order as delivery
	await transaction
		.update(personalSourcesEmailReceipts)
		.set({ senderDigest: null })
		.where(and(eq(personalSourcesEmailReceipts.id, receiptId), eq(personalSourcesEmailReceipts.state, "replied")))
	await transaction.delete(personalSourcesEmailChoices).where(eq(personalSourcesEmailChoices.receiptId, receiptId))
}

/**
 * Loads a sender-owned provider reference and numbered choices for a reply.
 */
export async function loadPersonalSourcesEmailChoices(
	{
		requestId,
		messageIds = [],
		userId,
		senderDigest,
	}: {
		requestId?: string
		messageIds?: string[]
		userId: string
		senderDigest: string
	},
	handle: DbHandle = db,
): Promise<{ id: string; emailId: string; messageId: string; topics: PersonalSourcesEmailTopicChoice[] } | null> {
	if (!requestId && !messageIds.length) {
		return null
	}
	const requests = await handle
		.select({
			id: personalSourcesEmailReceipts.id,
			emailId: personalSourcesEmailReceipts.emailId,
			messageId: personalSourcesEmailChoices.messageId,
			encryptedTopics: personalSourcesEmailChoices.encryptedTopics,
		})
		.from(personalSourcesEmailChoices)
		.innerJoin(personalSourcesEmailReceipts, eq(personalSourcesEmailReceipts.id, personalSourcesEmailChoices.receiptId))
		.where(
			and(
				requestId
					? eq(personalSourcesEmailChoices.receiptId, requestId)
					: inArray(personalSourcesEmailChoices.messageId, messageIds),
				eq(personalSourcesEmailChoices.userId, userId),
				eq(personalSourcesEmailReceipts.userId, userId),
				eq(personalSourcesEmailReceipts.senderDigest, senderDigest),
			),
		)
		.for("update")
	const closestId = messageIds.find((messageId) => requests.some((request) => request.messageId === messageId))
	const matches = requestId ? requests : requests.filter((request) => request.messageId === closestId)
	const request = matches.length === 1 ? matches[0] : null
	if (!request) {
		return null
	}

	// never reassign a number or disclose a Topic's old name after access changes
	const ids = storedChoiceIds.parse(JSON.parse(decryptPrivateText(request.encryptedTopics) ?? "null"))
	const editable = ids.length
		? await handle
				.select({ id: topics.id, name: topics.name })
				.from(topics)
				.where(and(inArray(topics.id, ids), toEditableTopicFilter(userId)))
		: []
	const ordered = editable.length === ids.length ? ids.flatMap((id) => editable.filter((topic) => topic.id === id)) : []
	return {
		id: request.id,
		emailId: request.emailId,
		messageId: request.messageId,
		topics: ordered.map((topic) => ({ ...topic, url: new URL(toTopicPath(topic), appUrl()).href })),
	}
}

// resume unfinished provider deliveries
const activeReceiptFilter = inArray(personalSourcesEmailReceipts.state, ["pending", "processing"])
const MAX_EMAIL_ATTEMPTS = 8

/**
 * Queues signed deliveries to Carl's mailbox. Unregistered senders can receive only account guidance.
 */
export async function queuePersonalSourcesEmailEvent(event: ReceivedEmailEvent): Promise<string[]> {
	if (!isPersonalSourcesEmailEnabled() || !event.data.to.some(isPersonalSourcesRecipient)) {
		return []
	}
	const sender = toEmailSenderAddress(event.data.from)
	if (!sender) {
		return []
	}
	const matchingUsers = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.emailVerified, true), sql`lower(${users.email}) = ${sender}`))
		.limit(2)
	const owner = matchingUsers.length === 1 ? matchingUsers[0] : undefined
	const [receipt] = await db
		.insert(personalSourcesEmailReceipts)
		.values({
			emailId: event.data.email_id,
			userId: owner?.id ?? null,
			senderDigest: toPersonalSourcesSenderDigest(sender),
			outcome: owner ? null : "account_required",
			replyStartedAt: owner ? null : new Date(),
		})
		.onConflictDoNothing()
		.returning({ id: personalSourcesEmailReceipts.id })
	return receipt ? [receipt.id] : []
}

/**
 * Checks the exact shared recipient, without granting identity to a display name or alias.
 */
export function isPersonalSourcesRecipient(recipient: string): boolean {
	return recipient.trim().toLowerCase() === readPersonalSourcesEmailAddress()
}

/**
 * Hashes the authenticated account mailbox so a later email change invalidates pending work.
 */
export function toPersonalSourcesSenderDigest(sender: string): string {
	return toAuthSecretSignature({
		value: sender.toLowerCase(),
		purpose: "personal sources email sender",
		encoding: "hex",
	})
}

export type AccountEmailDestination = {
	receipt: typeof personalSourcesEmailReceipts.$inferSelect
	owner: typeof users.$inferSelect
	reply: typeof personalSourcesEmailReplies.$inferSelect | null
}

/**
 * Keeps unregistered deliveries separate from receipts whose original account changed or was deleted.
 */
export async function loadPersonalSourcesEmailDestination(
	receiptId: string,
): Promise<AccountEmailDestination | { receipt: AccountEmailDestination["receipt"]; owner: null; reply: null } | null> {
	if (!isPersonalSourcesEmailEnabled()) {
		return null
	}
	const [destination] = await db
		.select({ receipt: personalSourcesEmailReceipts, owner: users, reply: personalSourcesEmailReplies })
		.from(personalSourcesEmailReceipts)
		.leftJoin(users, eq(users.id, personalSourcesEmailReceipts.userId))
		.leftJoin(personalSourcesEmailReplies, eq(personalSourcesEmailReplies.receiptId, personalSourcesEmailReceipts.id))
		.where(and(eq(personalSourcesEmailReceipts.id, receiptId), activeReceiptFilter))
	if (!destination?.receipt.senderDigest) {
		return null
	}
	const { receipt, owner, reply } = destination
	if (receipt.outcome === "account_required" && !receipt.userId) {
		return { receipt, owner: null, reply: null }
	}
	return owner?.emailVerified && toPersonalSourcesSenderDigest(owner.email) === receipt.senderDigest
		? { receipt, owner, reply }
		: null
}

/**
 * Rechecks account ownership inside the same user lock used by accepted entry persistence.
 */
export async function isPersonalSourcesEmailSenderCurrent(
	transaction: DbTransaction,
	userId: string,
	senderDigest: string,
): Promise<boolean> {
	const [owner] = await transaction
		.select({ email: users.email })
		.from(users)
		.where(and(eq(users.id, userId), eq(users.emailVerified, true)))
	return isPersonalSourcesEmailEnabled() && !!owner && toPersonalSourcesSenderDigest(owner.email) === senderDigest
}

/**
 * Reserves the next attempt with a recovery deadline before any provider call.
 */
export async function startPersonalSourcesEmailAttempt(receiptId: string): Promise<number | null> {
	const [receipt] = await db
		.update(personalSourcesEmailReceipts)
		.set({
			state: "processing",
			attemptCount: sql`${personalSourcesEmailReceipts.attemptCount} + 1`,
			nextAttemptAt: sql`clock_timestamp() + interval '5 minutes'`,
		})
		.where(
			and(
				eq(personalSourcesEmailReceipts.id, receiptId),
				activeReceiptFilter,
				lte(personalSourcesEmailReceipts.nextAttemptAt, sql`clock_timestamp()`),
			),
		)
		.returning({ attemptCount: personalSourcesEmailReceipts.attemptCount })
	return receipt?.attemptCount ?? null
}

/**
 * Queues a stable encrypted reply in the transaction that accepts the entry, or chooses clarification.
 */
export async function savePersonalSourcesEmailReply(
	transaction: DbTransaction,
	receiptId: string,
	reply: PersonalSourcesEmailReply,
	entryId: string | null,
): Promise<void> {
	const [receipt] = await transaction
		.update(personalSourcesEmailReceipts)
		.set({
			outcome: reply.kind,
			replyStartedAt: new Date(),
		})
		.where(
			and(
				eq(personalSourcesEmailReceipts.id, receiptId),
				activeReceiptFilter,
				isNull(personalSourcesEmailReceipts.outcome),
			),
		)
		.returning({ userId: personalSourcesEmailReceipts.userId })
	if (receipt?.userId) {
		await transaction.insert(personalSourcesEmailReplies).values({
			receiptId,
			userId: receipt.userId,
			entryId,
			encryptedPayload: encryptPrivateText(JSON.stringify(reply)),
		})
	}
}

/**
 * Retries a transient failure with bounded backoff, without discarding an already filed outcome.
 */
export async function retryPersonalSourcesEmailReceipt({
	receiptId,
	attemptCount,
}: {
	receiptId: string
	attemptCount: number
}): Promise<number | null> {
	if (attemptCount >= MAX_EMAIL_ATTEMPTS) {
		await finishPersonalSourcesEmailReceipt({ receiptId, state: "refused" })
		return null
	}
	const retryAfterMs = Math.min(30_000 * 2 ** (attemptCount - 1), 30 * 60_000)
	await db
		.update(personalSourcesEmailReceipts)
		.set({ state: "pending", nextAttemptAt: new Date(Date.now() + retryAfterMs) })
		.where(and(eq(personalSourcesEmailReceipts.id, receiptId), activeReceiptFilter))
	return retryAfterMs
}

/**
 * Settles a delivery and erases the pending reply snapshot, retaining only its replay tombstone.
 */
export async function finishPersonalSourcesEmailReceipt({
	receiptId,
	state,
}: {
	receiptId: string
	state: "replied" | "refused"
}): Promise<void> {
	await db.transaction(async (transaction) => {
		// only a delivered clarification still needs its sender binding
		const [settled] = await transaction
			.update(personalSourcesEmailReceipts)
			.set({
				state,
				replyStartedAt: null,
				senderDigest:
					state === "refused"
						? null
						: sql`case when exists (
					select 1 from ${personalSourcesEmailChoices} where ${personalSourcesEmailChoices.receiptId} = ${receiptId}
				) then ${personalSourcesEmailReceipts.senderDigest} else null end`,
			})
			.where(and(eq(personalSourcesEmailReceipts.id, receiptId), activeReceiptFilter))
			.returning({ id: personalSourcesEmailReceipts.id })
		if (!settled) {
			return
		}
		if (state === "refused") {
			await transaction.delete(personalSourcesEmailChoices).where(eq(personalSourcesEmailChoices.receiptId, receiptId))
		}
		await transaction.delete(personalSourcesEmailReplies).where(eq(personalSourcesEmailReplies.receiptId, receiptId))
	})
}

/**
 * Recovers due work after process loss without reading private message content.
 */
export async function loadPendingPersonalSourcesEmailIds(): Promise<string[]> {
	const receipts = await db
		.select({ id: personalSourcesEmailReceipts.id })
		.from(personalSourcesEmailReceipts)
		.where(and(activeReceiptFilter, lte(personalSourcesEmailReceipts.nextAttemptAt, sql`clock_timestamp()`)))
		.orderBy(personalSourcesEmailReceipts.nextAttemptAt)
		.limit(100)
	return receipts.map(({ id }) => id)
}
