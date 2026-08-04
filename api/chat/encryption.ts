// encrypting the chat text that is stored in the database for privacy
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { reportError } from "@shared/monitoring"

// the marker that says a stored value is encrypted. an unmarked value is plaintext, and a later scheme bumps the number
const CIPHERTEXT_PREFIX = "enc1:"

// AES-GCM's nonce and auth tag widths, fixed by the algorithm
const NONCE_BYTES = 12
const TAG_BYTES = 16

/**
 * Encrypt one chat turn's text for storage with AES-256-GCM under the environment's key.
 * With no key configured, the text stores as plaintext.
 */
export function encryptChatText(plainText: string): string {
	// no key means no encryption, which keeps a keyless self-host working. outside of dev that would write every
	// chat conversation to the database, so it throws an error instead of storing plaintext quietly
	const key = chatTextKey()
	if (!key) {
		if (Bun.env.DOPPLER_ENVIRONMENT && Bun.env.DOPPLER_ENVIRONMENT !== "dev") {
			throw new Error("CHAT_TEXT_KEY must be set outside dev, or chat text would be stored as plaintext")
		}
		return plainText
	}

	// a fresh nonce per value, with the auth tag stored alongside so tampering fails the read
	const nonce = randomBytes(NONCE_BYTES)
	const cipher = createCipheriv("aes-256-gcm", key, nonce)
	const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()])
	return CIPHERTEXT_PREFIX + Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64")
}

/**
 * Decrypt one stored value. A value stored as plaintext passes through unchanged, and one that fails to decrypt returns null,
 * so a bad key or a tampered row does not return the text.
 */
export function decryptChatText(storedText: string): string | null {
	// a value without the marker was written as plaintext and reads as it was written
	if (!storedText.startsWith(CIPHERTEXT_PREFIX)) {
		return storedText
	}

	// split the nonce, tag, and ciphertext back apart and refuse anything that does not verify
	try {
		const storedBytes = Buffer.from(storedText.slice(CIPHERTEXT_PREFIX.length), "base64")
		const decipher = createDecipheriv("aes-256-gcm", requireChatTextKey(), storedBytes.subarray(0, NONCE_BYTES))
		decipher.setAuthTag(storedBytes.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES))
		const plainBytes = decipher.update(storedBytes.subarray(NONCE_BYTES + TAG_BYTES))
		return Buffer.concat([plainBytes, decipher.final()]).toString("utf8")
	} catch (error) {
		// a failed verification is a wrong key or a tampered row. return null instead of the text
		console.error("chat text failed to decrypt", error)
		reportError(error, "chat")
		return null
	}
}

// the encryption key from the environment, or null when unset. a wrong-sized key throws an error
function chatTextKey(): Buffer | null {
	const encodedKey = Bun.env.CHAT_TEXT_KEY
	if (!encodedKey) {
		return null
	}

	// AES-256 takes exactly 32 bytes
	const key = Buffer.from(encodedKey, "base64")
	if (key.length !== 32) {
		throw new Error("CHAT_TEXT_KEY must be 32 bytes of base64")
	}
	return key
}

// the key when a ciphertext row demands one. reaching this with no key set means the key was removed after writing
function requireChatTextKey(): Buffer {
	const key = chatTextKey()
	if (!key) {
		throw new Error("CHAT_TEXT_KEY is unset but ciphertext rows exist")
	}
	return key
}
