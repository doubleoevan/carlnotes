// durable receipt processing keeps received bodies inside one activity's memory
import { isAdminRole } from "@carlnotes/contracts/enums"
import type {
	PersonalSourcesEmailReply,
	PersonalSourcesEmailTopicChoice,
	ReceivedPersonalSourcesEmail,
} from "@carlnotes/contracts/personalSourcesEmail"
import { PLANS } from "@carlnotes/contracts/plans"
import { type DbTransaction, db } from "@carlnotes/db"
import { runWithClaim } from "@carlnotes/db/claim"
import {
	type AccountEmailDestination as EmailDestination,
	finishPersonalSourcesEmailReceipt,
	isPersonalSourcesEmailSenderCurrent,
	loadPersonalSourcesEmailChoices,
	loadPersonalSourcesEmailDestination,
	retirePersonalSourcesEmailChoices,
	retryPersonalSourcesEmailReceipt,
	savePersonalSourcesEmailChoices,
	savePersonalSourcesEmailReply,
	startPersonalSourcesEmailAttempt,
} from "@carlnotes/db/personalSourcesEmailReceipts"
import { lockPersonalSourcesSender } from "@carlnotes/db/personalSourcesLocks"
import { readPersonalSourcesAllowance } from "@carlnotes/db/personalSourcesQuota"
import { receivePersonalSourcesSend } from "@carlnotes/db/personalSourcesSend"
import { personalSourcesEmailReceipts } from "@carlnotes/db/schema/personalSources"
import { normalizePersonalSourcesEmail } from "@carlnotes/server/personalSourcesEmailContent"
import { toPersonalSourcesEmailReplyContent } from "@carlnotes/server/personalSourcesEmailReplyContent"
import { eq } from "drizzle-orm"
import { loadAuthenticatedEmail, toEmailReplyMetadata } from "./emailMessage"
import { replyToPersonalSourcesEmail, replyToUnregisteredSender } from "./emailReplies"
import { readEmailReferenceIds, resolveEmailTopicSelection, resolvePersonalSourcesEmailTopics } from "./emailTopic"
import { notifyPersonalSourcesChanged } from "./work"

type EmailAttemptResult = { retryAfterMs: number | null }

/**
 * Processes one delivery or its pending reply, returning no private content to Temporal.
 */
export async function processPersonalSourcesEmail(receiptId: string): Promise<EmailAttemptResult> {
	const outcome = await runWithClaim({
		claimName: `personal-sources-email:${receiptId}`,
		runTask: () => processClaimedEmail(receiptId),
	})
	return outcome ?? { retryAfterMs: 30_000 }
}

// a stored outcome goes directly to its reply and is never fetched, matched, or filed again
async function processClaimedEmail(receiptId: string): Promise<EmailAttemptResult> {
	const destination = await loadPersonalSourcesEmailDestination(receiptId)
	if (!destination) {
		await finishPersonalSourcesEmailReceipt({ receiptId, state: "refused" })
		return { retryAfterMs: null }
	}
	const attemptCount = await startPersonalSourcesEmailAttempt(receiptId)
	if (attemptCount === null) {
		return { retryAfterMs: 30_000 }
	}
	try {
		const replyResult = destination.owner
			? await processAccountEmail(destination)
			: await replyToUnregisteredSender(destination.receipt)
		if (replyResult === "retry") {
			return { retryAfterMs: await retryPersonalSourcesEmailReceipt({ receiptId, attemptCount }) }
		}
		await finishPersonalSourcesEmailReceipt({ receiptId, state: replyResult })
		return { retryAfterMs: null }
	} catch {
		// provider error bodies and model failures may contain private text
		return { retryAfterMs: await retryPersonalSourcesEmailReceipt({ receiptId, attemptCount }) }
	}
}

// an accepted retry uses its original outcome and rechecks the live owner before sending
async function processAccountEmail(destination: EmailDestination): Promise<"replied" | "refused" | "retry"> {
	if (!destination.receipt.outcome && !(await receiveEmail(destination))) {
		return "refused"
	}
	const current = await loadPersonalSourcesEmailDestination(destination.receipt.id)
	return current?.owner ? replyToPersonalSourcesEmail(current) : "refused"
}

// authenticate the request and save only clearly matching destinations
async function receiveEmail(destination: EmailDestination): Promise<boolean> {
	const fetched = await loadAuthenticatedEmail(destination.receipt)
	if (!fetched) {
		return false
	}

	// quoted links do not turn an acknowledgment into a new request
	const { email, isReply } = toPersonalSourcesEmailReplyContent(fetched)
	const normalized = normalizePersonalSourcesEmail({
		email,
		ownerEmail: destination.owner.email,
		isOwnerEmailVerified: true,
	})
	if (isReply && !normalized.payload.links.length) {
		const messageIds = readEmailReferenceIds(fetched.headers)
		if (!messageIds.length || /^(thanks?( you)?|thank you|no|cancel)[.!]*$/i.test(normalized.payload.text.trim())) {
			return false
		}
		return receiveEmailChoice({ destination, email: fetched, normalized, messageIds })
	}
	const refusalReason = await emailRefusalReason(destination.owner)
	const matches = refusalReason
		? { topicIds: [], suggestions: [] }
		: await resolvePersonalSourcesEmailTopics(destination.owner.id, fetched.subject ?? "", normalized.payload)
	const changedTopicIds = await recordEmailFiling({
		destination,
		normalized,
		...matches,
		refusalReason,
		...toEmailReplyMetadata(fetched),
	})
	for (const topicId of changedTopicIds ?? []) {
		await notifyPersonalSourcesChanged(topicId)
	}
	return true
}

// a numbered reply retrieves the original only after sender ownership is established
async function receiveEmailChoice({
	destination,
	email,
	normalized,
	messageIds,
}: {
	destination: EmailDestination
	email: ReceivedPersonalSourcesEmail
	normalized: ReturnType<typeof normalizePersonalSourcesEmail>
	messageIds: string[]
}): Promise<boolean> {
	const request = await loadPersonalSourcesEmailChoices({
		messageIds,
		userId: destination.owner.id,
		senderDigest: destination.receipt.senderDigest ?? "",
	})
	if (!request) {
		return false
	}
	const refusalReason = await emailRefusalReason(destination.owner)
	const selectedIds = refusalReason
		? null
		: await resolveEmailTopicSelection({
				userId: destination.owner.id,
				text: normalized.payload.text,
				topics: request.topics,
			})
	const original = selectedIds ? await loadOriginalEmail(destination, request.emailId) : normalized
	const changedTopicIds = await recordEmailFiling({
		destination,
		normalized: original ?? normalized,
		topicIds: original ? (selectedIds ?? []) : [],
		suggestions: original ? request.topics : [],
		choiceRequestId: request.id,
		originalEmailId: request.emailId,
		refusalReason,
		...toEmailReplyMetadata(email, request.messageId),
		canChooseTopics: original !== null,
	})
	for (const topicId of changedTopicIds ?? []) {
		await notifyPersonalSourcesChanged(topicId)
	}
	return changedTopicIds !== null
}

// avoid paid matching and provider retrieval when a new email cannot be filed
async function emailRefusalReason(owner: EmailDestination["owner"]): Promise<"plan" | "quota" | undefined> {
	if (!isAdminRole(owner.role) && !PLANS[owner.plan].canEmailCarl) {
		return "plan"
	}
	const allowance = await readPersonalSourcesAllowance({ userId: owner.id })
	return allowance.isAvailable ? undefined : "quota"
}

// retrieve original content only for an authenticated, sender-owned choice request
async function loadOriginalEmail(
	destination: EmailDestination,
	emailId: string,
): Promise<ReturnType<typeof normalizePersonalSourcesEmail> | null> {
	const original = await loadAuthenticatedEmail({ emailId, senderDigest: destination.receipt.senderDigest })
	if (!original) {
		return null
	}
	const email = toPersonalSourcesEmailReplyContent(original).email
	return normalizePersonalSourcesEmail({ email, ownerEmail: destination.owner.email, isOwnerEmailVerified: true })
}

// a request either files atomically or receives content-free clarification
type EmailFilingOptions = {
	destination: EmailDestination
	normalized: ReturnType<typeof normalizePersonalSourcesEmail>
	topicIds: string[]
	refusalReason?: "plan" | "quota"
	inReplyTo?: string
	references?: string
	subject?: string
	suggestions?: PersonalSourcesEmailTopicChoice[]
	choiceRequestId?: string
	originalEmailId?: string
	canChooseTopics?: boolean
}

// serialize the account, request receipt, accepted content, and confirmation intent
async function recordEmailFiling(options: EmailFilingOptions): Promise<string[] | null> {
	const { destination } = options
	return db.transaction(async (transaction) => {
		// lock the sender before deciding the receipt outcome
		await lockPersonalSourcesSender(transaction, destination.owner.id)
		const [receipt] = await transaction
			.select()
			.from(personalSourcesEmailReceipts)
			.where(eq(personalSourcesEmailReceipts.id, destination.receipt.id))
			.for("update")
		if (
			receipt?.state !== "processing" ||
			receipt.outcome ||
			!receipt.senderDigest ||
			!(await isPersonalSourcesEmailSenderCurrent(transaction, destination.owner.id, receipt.senderDigest))
		) {
			return []
		}
		if (
			options.choiceRequestId &&
			!(await loadPersonalSourcesEmailChoices(
				{ requestId: options.choiceRequestId, userId: destination.owner.id, senderDigest: receipt.senderDigest },
				transaction,
			))
		) {
			return null
		}
		return saveEmailOutcome({ ...options, transaction, receipt })
	})
}

// the account and receipt are locked before this persistence step
type LockedEmailFilingOptions = EmailFilingOptions & {
	transaction: DbTransaction
	receipt: typeof personalSourcesEmailReceipts.$inferSelect
}

// save clear destinations through the shared atomic send operation
async function saveEmailOutcome(options: LockedEmailFilingOptions): Promise<string[]> {
	const { destination, receipt, normalized, topicIds, refusalReason, originalEmailId, transaction } = options
	const senderDigest = receipt.senderDigest
	if (!senderDigest) {
		return []
	}
	if (refusalReason || !topicIds.length) {
		return saveEmailClarification(options)
	}

	// charge once and commit every destination together
	const accepted = await receivePersonalSourcesSend(
		{
			userId: destination.owner.id,
			topicIds,
			senderIdentity: "email",
			requestId: originalEmailId ?? receipt.emailId,
			origin: "email",
			config: {},
			payload: normalized.payload,
			omittedLinkCount: normalized.omittedLinkCount,
			authorizeSender: (locked) => isPersonalSourcesEmailSenderCurrent(locked, destination.owner.id, senderDigest),
		},
		transaction,
	)
	return saveEmailConfirmation(options, accepted)
}

// retain only Topic choices and a provider reference when a reply is needed
async function saveEmailClarification({
	destination,
	receipt,
	transaction,
	suggestions = [],
	choiceRequestId,
	refusalReason,
	canChooseTopics = true,
	inReplyTo,
	references,
	subject,
}: LockedEmailFilingOptions): Promise<string[]> {
	if (choiceRequestId && !canChooseTopics) {
		await retirePersonalSourcesEmailChoices(transaction, choiceRequestId)
	}
	const requestId = choiceRequestId ?? receipt.id
	const canReplyWithChoices = canChooseTopics && (!!choiceRequestId || !!inReplyTo)
	const reply: PersonalSourcesEmailReply = refusalReason
		? { kind: "not_filed", reason: refusalReason }
		: { kind: "needs_topic", ...(canReplyWithChoices ? { requestId, topics: suggestions } : {}) }

	// keep the original body with the provider
	if (!refusalReason && canReplyWithChoices && !choiceRequestId && inReplyTo) {
		await savePersonalSourcesEmailChoices(transaction, {
			receiptId: requestId,
			userId: destination.owner.id,
			topics: suggestions,
			messageId: inReplyTo,
		})
	}
	await savePersonalSourcesEmailReply(transaction, receipt.id, { ...reply, inReplyTo, references, subject }, null)
	return []
}

// bind the confirmation to committed destinations and retire their choice request
async function saveEmailConfirmation(
	{ transaction, receipt, choiceRequestId, inReplyTo, references, subject }: LockedEmailFilingOptions,
	accepted: Awaited<ReturnType<typeof receivePersonalSourcesSend>>,
): Promise<string[]> {
	if (accepted.status !== "accepted") {
		const reply: PersonalSourcesEmailReply =
			accepted.status === "not_found"
				? { kind: "needs_topic" }
				: { kind: "not_filed", reason: accepted.status === "quota" ? "quota" : "unavailable" }
		await savePersonalSourcesEmailReply(transaction, receipt.id, { ...reply, inReplyTo, references, subject }, null)
		return []
	}

	// remove only the completed request's routing metadata
	const receipts = accepted.receipts ?? [accepted]
	const topics = receipts.map(({ topic, entryId }) => ({ name: topic.name, url: topic.url, entryId }))
	if (choiceRequestId) {
		await retirePersonalSourcesEmailChoices(transaction, choiceRequestId)
	}
	await savePersonalSourcesEmailReply(
		transaction,
		receipt.id,
		{ kind: "filed", topics, inReplyTo, references, subject },
		accepted.entryId,
	)
	return receipts.map(({ topic }) => topic.id)
}
