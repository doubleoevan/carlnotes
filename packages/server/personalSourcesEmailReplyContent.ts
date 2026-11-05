// reply extraction stays separate from manual forwards, whose forwarded content is intentional
import type { ReceivedPersonalSourcesEmail } from "@carlnotes/contracts/personalSourcesEmail"

const QUOTED_HTML = 'blockquote, .gmail_quote, .yahoo_quoted, .protonmail_quote, [type="cite"]'

/** Keeps the authored part of a reply delivered to Carl's mailbox, without fetching the original email. */
export function toPersonalSourcesEmailReplyContent(email: ReceivedPersonalSourcesEmail): {
	email: ReceivedPersonalSourcesEmail
	isReply: boolean
} {
	// explicit forwards retain forwarded bodies even when a client preserves threading headers
	const headers = new Headers(email.headers)
	const isForward = /^\s*(?:fwd?|fw)\s*:/i.test(email.subject ?? "")
	const isReply =
		!isForward && (headers.has("in-reply-to") || headers.has("references") || /^\s*re\s*:/i.test(email.subject ?? ""))
	if (!isReply) {
		return { email, isReply }
	}

	// prefer the stripped HTML because generated plain text can lose every quote marker
	return {
		isReply,
		email: {
			...email,
			text: email.html?.trim() ? null : stripQuotedText(email.text ?? ""),
			html: stripQuotedHtml(email.html ?? ""),
		},
	}
}

// common mail clients either prefix quoted lines or place a reply separator before the whole old message
function stripQuotedText(text: string): string {
	const lines = text.replaceAll("\r\n", "\n").split("\n")
	const authored: string[] = []
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? ""
		const following = lines.slice(index, index + 6).join("\n")
		const isReplySeparator =
			/^\s*On\b[\s\S]{0,1500}?wrote:\s*(?:\n|$)/i.test(following) ||
			/^\s*-{2,}\s*Original Message\s*-{2,}/i.test(line) ||
			(/^\s*From:/i.test(line) && /^\s*(?:Sent|Date):/im.test(following) && /^\s*Subject:/im.test(following))
		if (isReplySeparator) {
			break
		}
		if (!/^\s*>/.test(line)) {
			authored.push(line)
		}
	}
	return authored.join("\n").trim()
}

// Outlook uses a divider followed by siblings; other clients wrap quoted history in a subtree
function stripQuotedHtml(html: string): string {
	let isAfterDivider = false
	return new HTMLRewriter()
		.on(QUOTED_HTML, {
			element: (element) => {
				element.remove()
			},
		})
		.on("*", {
			element: (element) => {
				isAfterDivider ||= element.getAttribute("id")?.toLowerCase() === "divrplyfwdmsg"
				if (isAfterDivider) {
					element.remove()
				}
			},
		})
		.onDocument({
			text: (chunk) => {
				if (isAfterDivider) {
					chunk.remove()
				}
			},
		})
		.transform(html)
}
