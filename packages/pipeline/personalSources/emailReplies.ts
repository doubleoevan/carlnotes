// outgoing email replies use content-free snapshots and standard thread headers
import { type PersonalSourcesEmailReply, personalSourcesEmailReply } from "@carlnotes/contracts/personalSourcesEmail"
import { db } from "@carlnotes/db"
import {
	type AccountEmailDestination,
	loadPersonalSourcesEmailChoices,
} from "@carlnotes/db/personalSourcesEmailConfirmations"
import { personalSourceEntries } from "@carlnotes/db/schema/personalSources"
import { sendPersonalSourcesEmailReply } from "@carlnotes/emails/personalSourcesEmail"
import { trackEvent, trackVisitorEvent } from "@carlnotes/server/analytics"
import { normalizePersonalSourcesEmail, toEmailSenderAddress } from "@carlnotes/server/personalSourcesEmailContent"
import { toPersonalSourcesEmailReplyContent } from "@carlnotes/server/personalSourcesEmailReplyContent"
import { decryptPrivateText } from "@carlnotes/server/privateText"
import { and, eq, inArray } from "drizzle-orm"

import { loadAuthenticatedEmail, toEmailReplyMetadata } from "./emailMessage"

type ReplyResult = "replied" | "refused" | "retry"

/** Explains which address to use only after Resend authenticates the original From. */
export async function replyToUnregisteredSender(
	confirmation: AccountEmailDestination["confirmation"],
): Promise<ReplyResult> {
	if (!isInsideReplyWindow(confirmation.replyStartedAt)) {
		return "refused"
	}
	// load the authenticated email and its sender
	const original = await loadAuthenticatedEmail(confirmation)
	const sender = original && toEmailSenderAddress(original.from)
	if (!original || !sender) {
		return "refused"
	}

	// a quoted topic scan email link does not make a thank-you a new send
	const { email, isReply } = toPersonalSourcesEmailReplyContent(original)
	if (
		isReply &&
		!normalizePersonalSourcesEmail({ email, ownerEmail: sender, isOwnerEmailVerified: false }).payload.links.length
	) {
		return "refused"
	}
	const deliverEmailReplyResult = await deliverEmailReply({
		confirmationId: confirmation.id,
		to: sender,
		reply: { kind: "not_filed", reason: "account", ...toEmailReplyMetadata(original) },
	})
	if (deliverEmailReplyResult === "replied") {
		trackVisitorEvent("personal_sources_email_unregistered", { entryPoint: "email" })
	}
	return deliverEmailReplyResult
}

/**
 * Reports what a new email became: the entries it filed, or the reason it was not filed.
 */
export function trackPersonalSourcesEmail({ owner, reply: snapshot }: AccountEmailDestination): void {
	if (!snapshot?.encryptedPayload) {
		return
	}
	const reply = toStoredEmailReply(snapshot.encryptedPayload)
	const emailAnalyticsProperties = { entryPoint: "email", plan: owner.plan, origin: "email" }

	// a filed email counts one entry on each of its Topics, and names its Topic if there is only one
	if (reply.kind === "filed") {
		const topicId = reply.topics.length === 1 ? reply.topics[0]?.topicId : undefined
		trackEvent("personal_source_entry_received", owner.id, {
			...emailAnalyticsProperties,
			...(topicId && { topicId }),
			entryCount: reply.topics.length,
		})
		return
	}

	// an email that was not filed reports its reason, and a spent allowance reports the limit too
	const reason = reply.kind === "needs_topic" ? reply.kind : reply.reason
	trackEvent("personal_sources_email_unfiled", owner.id, { ...emailAnalyticsProperties, reason })
	if (reason === "quota") {
		trackEvent("personal_sources_quota_reached", owner.id, emailAnalyticsProperties)
	}
}

// the reply saved with an email's outcome
function toStoredEmailReply(encryptedPayload: string): PersonalSourcesEmailReply {
	return personalSourcesEmailReply.parse(JSON.parse(decryptPrivateText(encryptedPayload) ?? "null"))
}

/**
 * Delivers a stable reply only while its sender and accepted entries remain live.
 */
export async function replyToPersonalSourcesEmail({
	confirmation,
	owner,
	reply: snapshot,
}: AccountEmailDestination): Promise<ReplyResult> {
	if (!snapshot?.encryptedPayload || !isInsideReplyWindow(confirmation.replyStartedAt)) {
		return "refused"
	}
	const reply = toStoredEmailReply(snapshot.encryptedPayload)
	if (reply.kind === "filed" && !(await areEmailReplyEntriesLive(owner.id, reply))) {
		return "refused"
	}
	// do not deliver a stored Topic name or URL after the sender lost edit access
	if (reply.kind === "needs_topic" && reply.topics?.length) {
		const current = await loadPersonalSourcesEmailChoices({
			requestId: reply.requestId,
			userId: owner.id,
			senderDigest: confirmation.senderDigest ?? "",
		})
		if (!current || !reply.topics.every((topic, index) => topic.id === current.topics[index]?.id)) {
			return "refused"
		}
	}
	return deliverEmailReply({ confirmationId: confirmation.id, to: owner.email, reply })
}

// stop retries before Resend's 24-hour idempotency guarantee ends
function isInsideReplyWindow(startedAt: Date | null): boolean {
	return startedAt !== null && Date.now() - startedAt.getTime() < 23 * 60 * 60_000
}

// every retry uses the same message and provider delivery key
async function deliverEmailReply(input: Parameters<typeof sendPersonalSourcesEmailReply>[0]): Promise<ReplyResult> {
	const result = await sendPersonalSourcesEmailReply(input)
	return result.outcome === "accepted" ? "replied" : result.outcome === "retryable" ? "retry" : "refused"
}

// suppress the whole stable reply after any referenced entry is deleted, including a non-first destination
async function areEmailReplyEntriesLive(
	userId: string,
	reply: Extract<PersonalSourcesEmailReply, { kind: "filed" }>,
): Promise<boolean> {
	const entryIds = reply.topics.map((topic) => topic.entryId)
	const entries = await db
		.select({ id: personalSourceEntries.id })
		.from(personalSourceEntries)
		.where(and(eq(personalSourceEntries.userId, userId), inArray(personalSourceEntries.id, entryIds)))
	return entries.length === entryIds.length
}
