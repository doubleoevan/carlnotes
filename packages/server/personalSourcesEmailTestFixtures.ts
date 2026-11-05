// synthetic provider mail contains no real account, address token, or message content
import type { ReceivedPersonalSourcesEmail } from "@carlnotes/contracts/personalSourcesEmail"
import { Webhook } from "svix"

export const FIXTURE_PERSONAL_SOURCES_ADDRESS = "carl@example.com"
export const FIXTURE_EMAIL_ID = "642f5326-c840-43d9-899f-c1a7113d4ac9"
export const FIXTURE_WEBHOOK_SECRET = `whsec_${Buffer.alloc(32, 7).toString("base64")}`

/**
 * Builds a bounded synthetic Resend response with receiver-computed authentication.
 */
export function personalSourcesEmailFixture(
	overrides: Partial<ReceivedPersonalSourcesEmail> = {},
): ReceivedPersonalSourcesEmail {
	return {
		id: FIXTURE_EMAIL_ID,
		to: [FIXTURE_PERSONAL_SOURCES_ADDRESS],
		from: "owner@example.com",
		subject: "Coffee",
		text: "A public article https://example.org/coffee",
		html: null,
		headers: {},
		authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
		...overrides,
	}
}

/**
 * Signs exact synthetic webhook bytes using the provider's verification library.
 */
export function signedPersonalSourcesWebhook(body: string, date = new Date()): Headers {
	const id = "msg_fixture_personalSources"
	return new Headers({
		"content-type": "application/json",
		"svix-id": id,
		"svix-timestamp": String(Math.floor(date.getTime() / 1000)),
		"svix-signature": new Webhook(FIXTURE_WEBHOOK_SECRET).sign(id, date, body),
	})
}
