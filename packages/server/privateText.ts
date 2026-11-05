// authenticated encryption for private text, compatible with stored chat ciphertext
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// the stored format is marker, then base64 nonce, authentication tag, and ciphertext
export const PRIVATE_TEXT_PREFIX = "enc1:"
export const PRIVATE_TEXT_OVERHEAD_BYTES = 28
const NONCE_BYTES = 12
const TAG_BYTES = 16

/**
 * Encrypts private text with a required AES-256-GCM key and a fresh nonce.
 */
export function encryptPrivateText(plainText: string): string {
	// require the key before producing anything that could be persisted
	const key = requirePrivateTextKey()
	const nonce = randomBytes(NONCE_BYTES)
	const cipher = createCipheriv("aes-256-gcm", key, nonce)
	const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()])
	return PRIVATE_TEXT_PREFIX + Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64")
}

/**
 * Decrypts authenticated ciphertext, returning null for plaintext or failed verification.
 */
export function decryptPrivateText(storedText: string): string | null {
	if (!storedText.startsWith(PRIVATE_TEXT_PREFIX)) {
		return null
	}

	try {
		// reject invalid framing before checking the authentication tag
		const encodedText = storedText.slice(PRIVATE_TEXT_PREFIX.length)
		const storedBytes = Buffer.from(encodedText, "base64")
		if (storedBytes.length < PRIVATE_TEXT_OVERHEAD_BYTES || storedBytes.toString("base64") !== encodedText) {
			return null
		}

		// release plaintext only after the authentication check succeeds
		const decipher = createDecipheriv("aes-256-gcm", requirePrivateTextKey(), storedBytes.subarray(0, NONCE_BYTES))
		decipher.setAuthTag(storedBytes.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES))
		const plainBytes = decipher.update(storedBytes.subarray(PRIVATE_TEXT_OVERHEAD_BYTES))
		return Buffer.concat([plainBytes, decipher.final()]).toString("utf8")
	} catch {
		return null
	}
}

// private content requires a correctly sized key in every environment
function requirePrivateTextKey(): Buffer {
	const encodedKey = Bun.env.CHAT_TEXT_KEY
	if (!encodedKey) {
		throw new Error("CHAT_TEXT_KEY is required for private content")
	}

	// AES-256 keys contain exactly 32 decoded bytes
	const key = Buffer.from(encodedKey, "base64")
	if (key.length !== 32) {
		throw new Error("CHAT_TEXT_KEY must be 32 bytes of base64")
	}
	return key
}
