// authenticate exact webhook bytes before resolving sender accounts or fetching any provider content
import {
	type ReceivedEmailEvent,
	type ReceivedPersonalSourcesEmail,
	receivedEmailEvent,
	receivedEmailListHeaders,
	receivedPersonalSourcesEmail,
} from "@carlnotes/contracts/personalSourcesEmail"
import { Webhook } from "svix"
import { OversizedBodyError, readLimitedBody } from "./publicFetch"

// provider calls use a fixed HTTPS endpoint and bounded body/time. They never follow download URLs
const RESEND_INBOUND_URL = "https://api.resend.com/emails/receiving/"
const RESEND_INBOUND_TIMEOUT_MS = 20_000
export type ReceivedEmailResult =
	| { status: "received"; email: ReceivedPersonalSourcesEmail }
	| { status: "retry" }
	| { status: "refused" }

/**
 * Verifies the raw body and Svix replay window before accepting a received-email event.
 */
export function verifyResendInbound({ body, headers }: { body: string; headers: Headers }): ReceivedEmailEvent | null {
	const secret = Bun.env.RESEND_INBOUND_WEBHOOK_SECRET
	if (!secret) {
		return null
	}
	try {
		new Webhook(secret).verify(body, {
			"svix-id": headers.get("svix-id") ?? "",
			"svix-timestamp": headers.get("svix-timestamp") ?? "",
			"svix-signature": headers.get("svix-signature") ?? "",
		})
		const event = receivedEmailEvent.safeParse(JSON.parse(body))
		return event.success ? event.data : null
	} catch {
		return null
	}
}

/**
 * Retrieves bounded received text from Resend without loading raw mail or attachments.
 */
export async function fetchReceivedPersonalSourcesEmail(emailId: string): Promise<ReceivedEmailResult> {
	const apiKey = Bun.env.RESEND_API_KEY
	if (!apiKey || !/^[a-f0-9-]{36}$/i.test(emailId)) {
		return { status: "refused" }
	}
	try {
		const response = await fetch(`${RESEND_INBOUND_URL}${emailId}?html_format=cid`, {
			headers: { Authorization: `Bearer ${apiKey}` },
			signal: AbortSignal.timeout(RESEND_INBOUND_TIMEOUT_MS),
			redirect: "error",
		})
		if (!response.ok) {
			await response.body?.cancel()
			return { status: response.status === 429 || response.status >= 500 ? "retry" : "refused" }
		}
		const body = await readLimitedBody(response, RESEND_INBOUND_URL)
		const parsedEmail = receivedPersonalSourcesEmail.safeParse(JSON.parse(body))
		return parsedEmail.success && parsedEmail.data.id === emailId
			? {
					status: "received",
					email: { ...parsedEmail.data, headers: toReceivedEmailHeaders(parsedEmail.data.headers) },
				}
			: { status: "refused" }
	} catch (error) {
		// raw errors may contain private provider payloads. Return only a safe retry classification
		return { status: error instanceof OversizedBodyError || error instanceof SyntaxError ? "refused" : "retry" }
	}
}

// restore standard list headers for provenance and unsubscribe-link removal
function toReceivedEmailHeaders(headers: Record<string, string>): Record<string, string> {
	const listHeader = Object.entries(headers).find(([name]) => name.toLowerCase() === "list")?.[1]
	if (!listHeader || listHeader.length > 10_000) {
		return headers
	}
	try {
		const parsedList = receivedEmailListHeaders.safeParse(JSON.parse(listHeader))
		if (!parsedList.success) {
			return headers
		}
		const { id, unsubscribe } = parsedList.data
		return {
			...headers,
			...(id ? { "list-id": id.id } : {}),
			...(unsubscribe?.url ? { "list-unsubscribe": unsubscribe.url } : {}),
			...(unsubscribe?.mail && !unsubscribe.url ? { "list-unsubscribe": `mailto:${unsubscribe.mail}` } : {}),
		}
	} catch {
		return headers
	}
}
