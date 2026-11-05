// reuse the existing email shell for a filing receipt or a content-free request for a Topic
import { appUrl } from "@carlnotes/server/appUrl"
import { readPersonalSourcesEmailAddress } from "@carlnotes/server/personalSourcesSettings"
import { render } from "@react-email/render"
import { createElement } from "react"
import { type ResendCallResult, sendIdempotentEmailCall } from "./email"
import PersonalSourcesEmail, {
	type PersonalSourcesEmailProps,
	toPersonalSourcesEmailSubject,
} from "./personal-sources-email"

/**
 * Replies to the authenticated sender under one stable delivery key.
 */
export async function sendPersonalSourcesEmailReply({
	receiptId,
	to,
	reply,
}: {
	receiptId: string
	to: string
	reply: PersonalSourcesEmailProps["reply"]
}): Promise<ResendCallResult> {
	const props = { reply, receivingAddress: readPersonalSourcesEmailAddress(), appUrl: appUrl() }
	const [emailContent, plainTextContent] = await Promise.all([
		renderPersonalSourcesEmail(props),
		renderPersonalSourcesEmailText(props),
	])
	return sendIdempotentEmailCall({
		deliveryId: receiptId,
		hasStableKey: true,
		messages: [
			{
				to,
				subject: reply.subject ?? toPersonalSourcesEmailSubject(reply),
				emailContent,
				plainTextContent,
				emailKind: "personal-sources",
				replyTo: props.receivingAddress,
				headers: {
					"Auto-Submitted": "auto-replied",
					"X-Auto-Response-Suppress": "All",
					...(reply.inReplyTo
						? { "In-Reply-To": reply.inReplyTo, References: reply.references ?? reply.inReplyTo }
						: {}),
				},
			},
		],
	})
}

/**
 * Renders the email reply as HTML with linked, numbered destinations.
 */
export function renderPersonalSourcesEmail(props: PersonalSourcesEmailProps): Promise<string> {
	return render(createElement(PersonalSourcesEmail, props))
}

/**
 * Renders the same email reply as accessible plain text.
 */
export function renderPersonalSourcesEmailText(props: PersonalSourcesEmailProps): Promise<string> {
	return render(createElement(PersonalSourcesEmail, props), { plainText: true })
}
