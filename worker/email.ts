// send an email through Resend's HTTP API. a failure is logged and reported instead of being thrown,
// so a bad address never fails the caller. the return says whether resend accepted the send, to record for our records.
import { reportError } from "@shared/monitoring"

// which kind of email is being sent, so a blocked signup reports differently from a missed scan email
export type EmailKind =
	| "verification"
	| "password-reset"
	| "email-change"
	| "topic-invite"
	| "topic-scan"
	| "manual-scan"
	| "flag-content"

export async function sendEmail(message: {
	to: string
	subject: string
	emailContent: string
	// the same email message as text, sent with the HTML. a message with no text part reads as machine-generated and goes to a spam filter.
	// also, some clients and screen readers show this instead of HTML
	plainTextContent?: string
	emailKind: EmailKind
	headers?: Record<string, string>
}): Promise<boolean> {
	// log and skip without a key and a verified from-address. the reply address is optional,
	// and an unset one is dropped by JSON.stringify
	const apiKey = Bun.env.RESEND_API_KEY
	const fromEmail = Bun.env.RESEND_FROM_EMAIL
	if (!apiKey || !fromEmail) {
		console.error("RESEND_API_KEY and RESEND_FROM_EMAIL must be set to send email")
		return false
	}

	// post the email to Resend. a failure is logged instead of being thrown, and names the email domain instead of the full address
	const recipientDomain = message.to.split("@")[1] ?? "an unknown domain"
	try {
		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				from: fromEmail,
				reply_to: Bun.env.RESEND_REPLY_EMAIL,
				to: message.to,
				subject: message.subject,
				html: message.emailContent,
				text: message.plainTextContent,
				headers: message.headers,
			}),
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

		// log the message id, so a send that never lands can be traced in resend
		console.log(`resend accepted ${message.emailKind} to ${recipientDomain} as ${await toResendMessageId(response)}`)
		return true
	} catch (error) {
		console.error(`resend ${message.emailKind} to ${recipientDomain} threw`, error)
		reportError(error, "email", { emailKind: message.emailKind, recipientDomain })
		return false
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
