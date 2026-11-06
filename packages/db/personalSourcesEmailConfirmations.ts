// durable shared-address confirmations retain retry identity without retaining received message bodies
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
	personalSourcesEmailConfirmations,
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
		confirmationId: string
		userId: string
		topics: PersonalSourcesEmailTopicChoice[]
		messageId: string
	},
): Promise<void> {
	await transaction
		.insert(personalSourcesEmailChoices)
		.values({
			confirmationId: choices.confirmationId,
			userId: choices.userId,
			messageId: choices.messageId,
			encryptedTopics: encryptPrivateText(JSON.stringify(choices.topics.map(({ id }) => id))),
		})
		.onConflictDoNothing()
}

/**
 * Removes a completed choice list and its sender binding in the filing transaction.
 */
export async function retirePersonalSourcesEmailChoices(
	transaction: DbTransaction,
	confirmationId: string,
): Promise<void> {
	// settle the original confirmation before deleting its choices, in the same lock order as delivery
	await transaction
		.update(personalSourcesEmailConfirmations)
		.set({ senderDigest: null })
		.where(
			and(
				eq(personalSourcesEmailConfirmations.id, confirmationId),
				eq(personalSourcesEmailConfirmations.state, "replied"),
			),
		)
	await transaction
		.delete(personalSourcesEmailChoices)
		.where(eq(personalSourcesEmailChoices.confirmationId, confirmationId))
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
			id: personalSourcesEmailConfirmations.id,
			emailId: personalSourcesEmailConfirmations.emailId,
			messageId: personalSourcesEmailChoices.messageId,
			encryptedTopics: personalSourcesEmailChoices.encryptedTopics,
		})
		.from(personalSourcesEmailChoices)
		.innerJoin(
			personalSourcesEmailConfirmations,
			eq(personalSourcesEmailConfirmations.id, personalSourcesEmailChoices.confirmationId),
		)
		.where(
			and(
				requestId
					? eq(personalSourcesEmailChoices.confirmationId, requestId)
					: inArray(personalSourcesEmailChoices.messageId, messageIds),
				eq(personalSourcesEmailChoices.userId, userId),
				eq(personalSourcesEmailConfirmations.userId, userId),
				eq(personalSourcesEmailConfirmations.senderDigest, senderDigest),
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
	// keep the stored order, or no choices if a Topic stopped being editable
	const ordered = editable.length === ids.length ? ids.flatMap((id) => editable.filter((topic) => topic.id === id)) : []
	return {
		id: request.id,
		emailId: request.emailId,
		messageId: request.messageId,
		topics: ordered.map((topic) => ({ ...topic, url: new URL(toTopicPath(topic), appUrl()).href })),
	}
}

// resume unfinished provider deliveries
const activeConfirmationFilter = inArray(personalSourcesEmailConfirmations.state, ["pending", "processing"])
const MAX_EMAIL_ATTEMPTS = 8

/**
 * Queues signed deliveries to Carl's mailbox. Unregistered senders can receive only account guidance.
 */
export async function queuePersonalSourcesEmailEvent(event: ReceivedEmailEvent): Promise<string[]> {
	if (!isPersonalSourcesEmailEnabled() || !event.data.to.some(isPersonalSourcesRecipient)) {
		return []
	}
	// read the sender, and stop on an address that does not parse
	const sender = toEmailSenderAddress(event.data.from)
	if (!sender) {
		return []
	}
	// an email verified by exactly one account belongs to that account
	const matchingUsers = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.emailVerified, true), sql`lower(${users.email}) = ${sender}`))
		.limit(2)
	const owner = matchingUsers.length === 1 ? matchingUsers[0] : undefined
	// store one confirmation per email
	const [confirmation] = await db
		.insert(personalSourcesEmailConfirmations)
		.values({
			emailId: event.data.email_id,
			userId: owner?.id ?? null,
			senderDigest: toPersonalSourcesSenderDigest(sender),
			outcome: owner ? null : "account_required",
			replyStartedAt: owner ? null : new Date(),
		})
		.onConflictDoNothing()
		.returning({ id: personalSourcesEmailConfirmations.id })
	return confirmation ? [confirmation.id] : []
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
	confirmation: typeof personalSourcesEmailConfirmations.$inferSelect
	owner: typeof users.$inferSelect
	reply: typeof personalSourcesEmailReplies.$inferSelect | null
}

/**
 * Keeps unregistered deliveries separate from confirmations whose original account changed or was deleted.
 */
export async function loadPersonalSourcesEmailDestination(
	confirmationId: string,
): Promise<
	AccountEmailDestination | { confirmation: AccountEmailDestination["confirmation"]; owner: null; reply: null } | null
> {
	if (!isPersonalSourcesEmailEnabled()) {
		return null
	}
	// load the active confirmation with its account and reply
	const [destination] = await db
		.select({ confirmation: personalSourcesEmailConfirmations, owner: users, reply: personalSourcesEmailReplies })
		.from(personalSourcesEmailConfirmations)
		.leftJoin(users, eq(users.id, personalSourcesEmailConfirmations.userId))
		.leftJoin(
			personalSourcesEmailReplies,
			eq(personalSourcesEmailReplies.confirmationId, personalSourcesEmailConfirmations.id),
		)
		.where(and(eq(personalSourcesEmailConfirmations.id, confirmationId), activeConfirmationFilter))
	// a finished confirmation has no sender digest
	if (!destination?.confirmation.senderDigest) {
		return null
	}
	// account guidance has no owner, and everything else needs the same verified owner
	const { confirmation, owner, reply } = destination
	if (confirmation.outcome === "account_required" && !confirmation.userId) {
		return { confirmation, owner: null, reply: null }
	}
	return owner?.emailVerified && toPersonalSourcesSenderDigest(owner.email) === confirmation.senderDigest
		? { confirmation, owner, reply }
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
export async function startPersonalSourcesEmailAttempt(confirmationId: string): Promise<number | null> {
	const [confirmation] = await db
		.update(personalSourcesEmailConfirmations)
		.set({
			state: "processing",
			attemptCount: sql`${personalSourcesEmailConfirmations.attemptCount} + 1`,
			nextAttemptAt: sql`clock_timestamp() + interval '5 minutes'`,
		})
		.where(
			and(
				eq(personalSourcesEmailConfirmations.id, confirmationId),
				activeConfirmationFilter,
				lte(personalSourcesEmailConfirmations.nextAttemptAt, sql`clock_timestamp()`),
			),
		)
		.returning({ attemptCount: personalSourcesEmailConfirmations.attemptCount })
	return confirmation?.attemptCount ?? null
}

/**
 * Queues a stable encrypted reply in the transaction that accepts the entry, or chooses clarification.
 */
export async function savePersonalSourcesEmailReply(
	transaction: DbTransaction,
	confirmationId: string,
	reply: PersonalSourcesEmailReply,
	entryId: string | null,
): Promise<void> {
	const [confirmation] = await transaction
		.update(personalSourcesEmailConfirmations)
		.set({
			outcome: reply.kind,
			replyStartedAt: new Date(),
		})
		.where(
			and(
				eq(personalSourcesEmailConfirmations.id, confirmationId),
				activeConfirmationFilter,
				isNull(personalSourcesEmailConfirmations.outcome),
			),
		)
		.returning({ userId: personalSourcesEmailConfirmations.userId })
	if (confirmation?.userId) {
		await transaction.insert(personalSourcesEmailReplies).values({
			confirmationId,
			userId: confirmation.userId,
			entryId,
			encryptedPayload: encryptPrivateText(JSON.stringify(reply)),
		})
	}
}

/**
 * Retries a transient failure with bounded backoff, without discarding an already filed outcome.
 */
export async function retryPersonalSourcesEmailConfirmation({
	confirmationId,
	attemptCount,
}: {
	confirmationId: string
	attemptCount: number
}): Promise<number | null> {
	// give up after the last attempt
	if (attemptCount >= MAX_EMAIL_ATTEMPTS) {
		await finishPersonalSourcesEmailConfirmation({ confirmationId, state: "refused" })
		return null
	}
	// back off, doubling each attempt up to 30 minutes
	const retryAfterMs = Math.min(30_000 * 2 ** (attemptCount - 1), 30 * 60_000)
	await db
		.update(personalSourcesEmailConfirmations)
		.set({ state: "pending", nextAttemptAt: new Date(Date.now() + retryAfterMs) })
		.where(and(eq(personalSourcesEmailConfirmations.id, confirmationId), activeConfirmationFilter))
	return retryAfterMs
}

/**
 * Settles a delivery and erases the pending reply snapshot, retaining only its replay tombstone.
 */
export async function finishPersonalSourcesEmailConfirmation({
	confirmationId,
	state,
}: {
	confirmationId: string
	state: "replied" | "refused"
}): Promise<void> {
	await db.transaction(async (transaction) => {
		// only a delivered clarification still needs its sender binding
		const [settled] = await transaction
			.update(personalSourcesEmailConfirmations)
			.set({
				state,
				replyStartedAt: null,
				senderDigest:
					state === "refused"
						? null
						: sql`case when exists (
					select 1 from ${personalSourcesEmailChoices} where ${personalSourcesEmailChoices.confirmationId} = ${confirmationId}
				) then ${personalSourcesEmailConfirmations.senderDigest} else null end`,
			})
			.where(and(eq(personalSourcesEmailConfirmations.id, confirmationId), activeConfirmationFilter))
			.returning({ id: personalSourcesEmailConfirmations.id })
		if (!settled) {
			return
		}
		// a rejected email loses its numbered choices
		if (state === "refused") {
			await transaction
				.delete(personalSourcesEmailChoices)
				.where(eq(personalSourcesEmailChoices.confirmationId, confirmationId))
		}
		// a finished email never keeps its reply snapshot
		await transaction
			.delete(personalSourcesEmailReplies)
			.where(eq(personalSourcesEmailReplies.confirmationId, confirmationId))
	})
}

/**
 * Recovers due work after process loss without reading private message content.
 */
export async function loadPendingPersonalSourcesEmailIds(): Promise<string[]> {
	// read the oldest due confirmations
	const confirmations = await db
		.select({ id: personalSourcesEmailConfirmations.id })
		.from(personalSourcesEmailConfirmations)
		.where(and(activeConfirmationFilter, lte(personalSourcesEmailConfirmations.nextAttemptAt, sql`clock_timestamp()`)))
		.orderBy(personalSourcesEmailConfirmations.nextAttemptAt)
		.limit(100)
	return confirmations.map(({ id }) => id)
}
