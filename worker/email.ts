// send an email through Resend's HTTP API
import { reportError } from "@shared/monitoring"
import { z } from "zod"

// which kind of email is being sent, so a blocked signup reports differently from a missed scan email
export type EmailKind =
	// the account emails, each sent to one address on its own
	| "verification"
	| "password-reset"
	| "email-change"
	| "topic-invite"
	| "team-invite"
	// the reading emails, which a scan sends in batches
	| "topic-scan"
	| "manual-scan"
	| "flag-content"

// one email to send, shared by the single and batch senders
export type EmailMessage = {
	to: string
	subject: string
	emailContent: string
	// the same email message as text, sent with the HTML
	plainTextContent?: string
	emailKind: EmailKind
	headers?: Record<string, string>
}

// whether resend will take this address, checked here because one refusal fails the whole batch
function isSendableAddress(address: string): boolean {
	return z.email().safeParse(address.trim()).success
}

// how many emails Resend accepts in one batch call
const RESEND_BATCH_LIMIT = 100

export async function sendEmail(message: EmailMessage): Promise<boolean> {
	// log and skip without a key and a verified from-address
	const apiKey = Bun.env.RESEND_API_KEY
	const fromEmail = Bun.env.RESEND_FROM_EMAIL
	if (!apiKey || !fromEmail) {
		console.error("RESEND_API_KEY and RESEND_FROM_EMAIL must be set to send email")
		return false
	}

	// post the email to Resend
	const recipientDomain = message.to.split("@")[1] ?? "an unknown domain"
	try {
		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify(toResendEmailBody(message, fromEmail)),
		})
		if (!response.ok) {
			// a subscriber silently not receiving their scan email is reported.
			const errorBody = await response.text()
			console.error(`resend ${message.emailKind} to ${recipientDomain} failed: ${response.status} ${errorBody}`)
			reportError(new Error(`resend rejected the send with ${response.status}`), "email", {
				status: String(response.status),
				emailKind: message.emailKind,
				recipientDomain,
				resendError: toResendErrorName(errorBody),
			})
			return false
		}

		// log the message id, so a send that never arrives can be traced in resend
		console.log(`resend accepted ${message.emailKind} to ${recipientDomain} as ${await toResendMessageId(response)}`)
		return true
	} catch (error) {
		console.error(`resend ${message.emailKind} to ${recipientDomain} threw`, error)
		reportError(error, "email", { emailKind: message.emailKind, recipientDomain })
		return false
	}
}

/**
 * Send multiple emails through Resend's batch endpoint, up to 100 per call instead of one POST per recipient.
 * Returns one acceptance flag per message, in the message order. A rejected call marks its whole chunk not accepted.
 */
export async function sendEmailBatches(messages: EmailMessage[]): Promise<boolean[]> {
	// nothing to send needs no config check
	if (messages.length === 0) {
		return []
	}

	// log and skip without a key and a verified from-address, the same guard the single send makes
	const apiKey = Bun.env.RESEND_API_KEY
	const fromEmail = Bun.env.RESEND_FROM_EMAIL
	if (!apiKey || !fromEmail) {
		console.error("RESEND_API_KEY and RESEND_FROM_EMAIL must be set to send email")
		return messages.map(() => false)
	}

	// resend refuses the whole batch when one address fails its validation
	const sendableMessages = messages.filter((message) => isSendableAddress(message.to))
	if (sendableMessages.length < messages.length) {
		console.error(`skipped ${messages.length - sendableMessages.length} emails whose address could not be sent to`)
	}

	// send one messages batch at a time within Resend's per-call limit, collecting one flag per message
	const acceptedByMessage = new Map<EmailMessage, boolean>()
	for (let start = 0; start < sendableMessages.length; start += RESEND_BATCH_LIMIT) {
		const messagesBatch = sendableMessages.slice(start, start + RESEND_BATCH_LIMIT)
		// the whole batch shares one outcome, so each of its messages reports what the call returned
		const isMessagesAccepted = await sendEmailBatch(messagesBatch, apiKey, fromEmail)
		for (const message of messagesBatch) {
			acceptedByMessage.set(message, isMessagesAccepted)
		}
	}
	return messages.map((message) => acceptedByMessage.get(message) ?? false)
}

// post a batch of messages to Resend's batch endpoint
async function sendEmailBatch(messagesBatch: EmailMessage[], apiKey: string, fromEmail: string): Promise<boolean> {
	// the batch's messages all come from one caller, so the first message names the kind for the logs
	const emailKind = messagesBatch[0]?.emailKind ?? "topic-scan"
	try {
		const response = await fetch("https://api.resend.com/emails/batch", {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify(messagesBatch.map((message) => toResendEmailBody(message, fromEmail))),
		})
		if (!response.ok) {
			// every recipient in a rejected batch silently misses their email, so the rejection is reported
			const errorBody = await response.text()
			console.error(
				`resend batch of ${messagesBatch.length} ${emailKind} emails failed: ${response.status} ${errorBody}`,
			)
			reportError(new Error(`resend rejected the batch with ${response.status}`), "email", {
				status: String(response.status),
				emailKind,
				batchSize: String(messagesBatch.length),
				resendError: toResendErrorName(errorBody),
			})
			return false
		}

		// a batch is atomic, so an accepted call returns one id per message
		const acceptedIds = ((await response.json().catch(() => null)) as { data?: unknown[] } | null)?.data
		if (acceptedIds && acceptedIds.length !== messagesBatch.length) {
			reportError(new Error("resend accepted a batch without an id for every message"), "email", {
				emailKind,
				batchSize: String(messagesBatch.length),
				acceptedCount: String(acceptedIds.length),
			})
		}

		// log the batch size, so an accepted batch that never arrives can be traced in resend
		console.log(`resend accepted a batch of ${messagesBatch.length} ${emailKind} emails`)
		return true
	} catch (error) {
		console.error(`resend batch of ${messagesBatch.length} ${emailKind} emails threw`, error)
		reportError(error, "email", { emailKind, batchSize: String(messagesBatch.length) })
		return false
	}
}

// the JSON body Resend takes for one email, shared by the single and batch senders
function toResendEmailBody(message: EmailMessage, fromEmail: string): Record<string, unknown> {
	return {
		from: fromEmail,
		reply_to: Bun.env.RESEND_REPLY_EMAIL,
		to: message.to,
		subject: message.subject,
		html: message.emailContent,
		text: message.plainTextContent,
		headers: message.headers,
	}
}

/**
 * The error name out of Resend's JSON body
 */
export function toResendErrorName(errorBody: string): string {
	try {
		const { name } = JSON.parse(errorBody) as { name?: string }
		return name ?? "an unnamed error"
	} catch {
		return "an unparsed error"
	}
}

// the message id out of Resend's JSON body
async function toResendMessageId(response: Response): Promise<string> {
	try {
		const { id } = (await response.json()) as { id?: string }
		return id ?? "an unknown id"
	} catch {
		return "an unreadable id"
	}
}
