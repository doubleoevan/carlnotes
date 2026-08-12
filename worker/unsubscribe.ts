// signed one-click unsubscribe tokens for the topic-scan email. the signature stops anyone from unsubscribing someone else.
// HMAC-SHA256 over a base64url payload, signed by the shared signer also used for the signup-gate token in api/auth.ts
import { toSignature } from "@shared/signedTokens"

// an unsubscribe token carries the recipient and the topic to drop them from
type UnsubscribePayload = { userId: string; topicId: string }

// sign a token that unsubscribes this user from this topic. the worker mints one per recipient at email-send time
export async function signUnsubscribeToken(unsubscribePayload: UnsubscribePayload): Promise<string> {
	// a base64url payload plus its signature, joined by a dot
	const encodedPayload = Buffer.from(JSON.stringify(unsubscribePayload)).toString("base64url")
	return `${encodedPayload}.${await toSignature(encodedPayload)}`
}

// verify a token's signature and shape, returning its payload or null when either is wrong
export async function verifyUnsubscribeToken(token: string): Promise<UnsubscribePayload | null> {
	// split the payload from its signature and reject a tampered or malformed token
	const [encodedPayload, signature] = token.split(".")
	if (!encodedPayload || !signature || signature !== (await toSignature(encodedPayload))) {
		return null
	}

	// the signature holds, so decode the payload and require both fields
	try {
		const unsubscribePayload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString()) as UnsubscribePayload
		return unsubscribePayload.userId && unsubscribePayload.topicId ? unsubscribePayload : null
	} catch {
		return null
	}
}
