// verify a provider message before routing it or replying to its sender
import type { ReceivedPersonalSourcesEmail } from "@carlnotes/contracts/personalSourcesEmail"
import {
	isPersonalSourcesRecipient,
	toPersonalSourcesSenderDigest,
} from "@carlnotes/db/personalSourcesEmailConfirmations"
import { waitForResendSlot } from "@carlnotes/db/resendRateLimit"
import {
	hasAuthenticatedPersonalSourcesSender,
	toEmailSenderAddress,
} from "@carlnotes/server/personalSourcesEmailContent"
import { fetchReceivedPersonalSourcesEmail } from "@carlnotes/server/resendInbound"
import { readEmailReferenceIds } from "./emailTopic"

/** Reads authenticated human mail for the sender and mailbox named by the signed webhook. */
export async function loadAuthenticatedEmail({
	emailId,
	senderDigest,
}: {
	emailId: string
	senderDigest: string | null
}): Promise<ReceivedPersonalSourcesEmail | null> {
	// retry transient provider failures through the existing durable confirmation
	await waitForResendSlot()
	const fetched = await fetchReceivedPersonalSourcesEmail(emailId)
	if (fetched.status === "retry") {
		throw new Error("Temporary received-email failure")
	}
	if (fetched.status !== "received") {
		return null
	}

	// only the authenticated From can receive a reply, including account guidance
	const email = fetched.email
	const sender = toEmailSenderAddress(email.from)
	if (
		!sender ||
		toPersonalSourcesSenderDigest(sender) !== senderDigest ||
		email.id !== emailId ||
		!email.to.some(isPersonalSourcesRecipient) ||
		!hasAuthenticatedPersonalSourcesSender(email) ||
		isPersonalSourcesRecipient(sender)
	) {
		return null
	}

	// ignore automated responses and delivery reports before matching or sending
	const headers = new Map(Object.entries(email.headers).map(([name, value]) => [name.toLowerCase(), value]))
	const autoSubmitted = headers.get("auto-submitted")?.trim().toLowerCase()
	if (
		(autoSubmitted && autoSubmitted !== "no") ||
		headers.has("x-autoreply") ||
		headers.has("x-autorespond") ||
		/^multipart\/report/i.test(headers.get("content-type") ?? "")
	) {
		return null
	}
	return email
}

/** Builds a same-thread reply from bounded RFC message identifiers. */
export function toEmailReplyMetadata(
	email: ReceivedPersonalSourcesEmail,
	originalMessageId?: string,
): { inReplyTo?: string; references?: string; subject?: string } {
	const headerId = Object.entries(email.headers).find(([name]) => name.toLowerCase() === "message-id")?.[1]
	const messageId = (email.message_id ?? headerId)?.trim()
	const inReplyTo = messageId && messageId.length <= 998 && /^<[^<>\s]+>$/.test(messageId) ? messageId : undefined
	const originalSubject = email.subject
		?.replace(/[\r\n]/g, " ")
		.trim()
		.slice(0, 990)
	const subject = originalSubject
		? /^re:/i.test(originalSubject)
			? originalSubject
			: `Re: ${originalSubject}`
		: undefined
	const ancestors = readEmailReferenceIds(email.headers)
		.reverse()
		.filter((id) => id !== originalMessageId)
	const references = [
		...new Set([...ancestors, ...(originalMessageId ? [originalMessageId] : []), ...(inReplyTo ? [inReplyTo] : [])]),
	]
		.slice(-32)
		.join(" ")
	return { inReplyTo, references: references || undefined, subject }
}
