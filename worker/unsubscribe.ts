// signed one-click unsubscribe tokens for the topic-scan email

// an unsubscribe token includes the recipient and the topic to drop them from
type UnsubscribePayload = { userId: string; topicId: string }

// sign a token that unsubscribes this user from this topic. the worker creates one per recipient at email-send time
export async function signUnsubscribeToken(unsubscribePayload: UnsubscribePayload): Promise<string> {
	// a base64url payload plus its signature, joined by a dot
	const encodedPayload = Buffer.from(JSON.stringify(unsubscribePayload)).toString("base64url")
	return `${encodedPayload}.${await toSignature(encodedPayload)}`
}

// verify a token's signature and shape, returning its payload or null if either is wrong
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

// HMAC-SHA256 of the value keyed on the app auth secret, base64url-encoded
async function toSignature(value: string): Promise<string> {
	// the app auth secret keys the signature, so a token can't be forged without it
	const secret = Bun.env.BETTER_AUTH_SECRET
	if (!secret) {
		throw new Error("BETTER_AUTH_SECRET must be set to sign unsubscribe tokens")
	}

	// import the secret as an HMAC key, sign the value, and url-encode the result
	const encoder = new TextEncoder()
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
	])
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value))
	return Buffer.from(signature).toString("base64url")
}
