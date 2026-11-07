// signed one-click unsubscribe tokens for the topic scan email and the notifications email
import { isSameSignature, toAuthSecretSignature } from "@carlnotes/server/hmac"

// an unsubscribe token includes the recipient and what to stop: one topic's emails, or the notifications email
export type UnsubscribePayload = { userId: string; topicId: string } | { userId: string; emailKind: "notifications" }

// sign a token that unsubscribes this user from this topic, or from the notifications email
export async function signUnsubscribeToken(unsubscribePayload: UnsubscribePayload): Promise<string> {
	// a base64url payload plus its signature, joined by a dot
	const encodedPayload = Buffer.from(JSON.stringify(unsubscribePayload)).toString("base64url")
	return `${encodedPayload}.${toSignature(encodedPayload)}`
}

// the recipient's signed one-click unsubscribe url on the app at the base url
export async function toUnsubscribeUrl(baseUrl: string, unsubscribePayload: UnsubscribePayload): Promise<string> {
	const unsubscribeToken = await signUnsubscribeToken(unsubscribePayload)
	return `${baseUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
}

// the List-Unsubscribe headers that let inbox providers offer their own one-click unsubscribe link (RFC 8058)
export function toUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
	return { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
}

// verify a token's signature and shape, returning its payload or null if either is wrong
export async function verifyUnsubscribeToken(token: string): Promise<UnsubscribePayload | null> {
	// split the payload from its signature and reject a tampered or malformed token
	const [encodedPayload, signature] = token.split(".")
	if (
		!encodedPayload ||
		!signature ||
		!isSameSignature({ expectedSignature: toSignature(encodedPayload), signature })
	) {
		return null
	}

	// the signature holds, so decode the payload and require its user and either a topic or the notifications kind
	try {
		const unsubscribePayload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString()) as UnsubscribePayload

		// a topic's token names the topic, and any other names the notifications email
		const isComplete =
			"topicId" in unsubscribePayload
				? Boolean(unsubscribePayload.topicId)
				: unsubscribePayload.emailKind === "notifications"
		return unsubscribePayload.userId && isComplete ? unsubscribePayload : null
	} catch {
		// a payload that is not json names nothing
		return null
	}
}

// HMAC-SHA256 of the value keyed on the app auth secret, base64url-encoded
function toSignature(value: string): string {
	// the app auth secret keys the signature, so a token can't be forged without it
	return toAuthSecretSignature({ value, purpose: "unsubscribe tokens", encoding: "base64url" })
}
