// outgoing email replies use content-free snapshots and standard thread headers
import { type PersonalSourcesEmailReply, personalSourcesEmailReply } from "@carlnotes/contracts/personalSourcesEmail"
import { db } from "@carlnotes/db"
import {
	type AccountEmailDestination,
	loadPersonalSourcesEmailChoices,
} from "@carlnotes/db/personalSourcesEmailReceipts"
import { personalSourceEntries } from "@carlnotes/db/schema/personalSources"
import { sendPersonalSourcesEmailReply } from "@carlnotes/emails/personalSourcesEmail"
import { normalizePersonalSourcesEmail, toEmailSenderAddress } from "@carlnotes/server/personalSourcesEmailContent"
import { toPersonalSourcesEmailReplyContent } from "@carlnotes/server/personalSourcesEmailReplyContent"
import { decryptPrivateText } from "@carlnotes/server/privateText"
import { and, eq, inArray } from "drizzle-orm"

import { loadAuthenticatedEmail, toEmailReplyMetadata } from "./emailMessage"

type ReplyResult = "replied" | "refused" | "retry"

/** Explains which address to use only after Resend authenticates the original From. */
export async function replyToUnregisteredSender(receipt: AccountEmailDestination["receipt"]): Promise<ReplyResult> {
	if (!isInsideReplyWindow(receipt.replyStartedAt)) {
		return "refused"
	}
	const original = await loadAuthenticatedEmail(receipt)
	const sender = original && toEmailSenderAddress(original.from)
	if (!original || !sender) {
		return "refused"
	}

	// a quoted digest link does not make a thank-you a new send
	const { email, isReply } = toPersonalSourcesEmailReplyContent(original)
	if (
		isReply &&
		!normalizePersonalSourcesEmail({ email, ownerEmail: sender, isOwnerEmailVerified: false }).payload.links.length
	) {
		return "refused"
	}
	return deliverEmailReply({
		receiptId: receipt.id,
		to: sender,
		reply: { kind: "not_filed", reason: "account", ...toEmailReplyMetadata(original) },
	})
}

/**
 * Delivers a stable reply only while its sender and accepted entries remain live.
 */
export async function replyToPersonalSourcesEmail({
	receipt,
	owner,
	reply: snapshot,
}: AccountEmailDestination): Promise<ReplyResult> {
	if (!snapshot?.encryptedPayload || !isInsideReplyWindow(receipt.replyStartedAt)) {
		return "refused"
	}
	const reply = personalSourcesEmailReply.parse(JSON.parse(decryptPrivateText(snapshot.encryptedPayload) ?? "null"))
	if (reply.kind === "filed" && !(await areEmailReplyEntriesLive(owner.id, reply))) {
		return "refused"
	}
	// do not deliver a stored Topic name or URL after the sender lost edit access
	if (reply.kind === "needs_topic" && reply.topics?.length) {
		const current = await loadPersonalSourcesEmailChoices({
			requestId: reply.requestId,
			userId: owner.id,
			senderDigest: receipt.senderDigest ?? "",
		})
		if (!current || !reply.topics.every((topic, index) => topic.id === current.topics[index]?.id)) {
			return "refused"
		}
	}
	return deliverEmailReply({ receiptId: receipt.id, to: owner.email, reply })
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
