// the element a view or a listen counts as. a user counts by user id, and a visitor by a keyed hash of the address and
// the user agent, which is added to a HyperLogLog and never stored
import { toAuthSecretSignature } from "./hmac"

// who sent a view or a listen: the signed-in user, the address the trusted proxies resolve, and the user agent
export type RequestSender = { userId: string | null; clientAddress: string | null; userAgent: string | null }

/**
 * Returns the element a view or a listen adds to its counter, or null for a visitor with no address or no auth secret.
 */
export function toViewerElement({ userId, clientAddress, userAgent }: RequestSender): string | null {
	if (userId) {
		return toUserViewerElement(userId)
	}
	if (!clientAddress) {
		return null
	}

	// lead the value with viewer-count so the hash differs from any other signature of the same address
	try {
		const value = `viewer-count\n${clientAddress}\n${userAgent ?? ""}`
		return `v:${toAuthSecretSignature({ value, purpose: "viewer counts", encoding: "base64url" })}`
	} catch {
		return null
	}
}

/**
 * Returns the element a signed-in user counts as.
 */
export function toUserViewerElement(userId: string): string {
	return `u:${userId}`
}
