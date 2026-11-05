// encrypting the chat text that is stored in the database for privacy
import { reportError } from "@carlnotes/server/monitoring"
import {
	decryptPrivateText,
	encryptPrivateText,
	PRIVATE_TEXT_OVERHEAD_BYTES,
	PRIVATE_TEXT_PREFIX,
} from "@carlnotes/server/privateText"
import { type SQL, type SQLWrapper, sql } from "drizzle-orm"

// the marker that says a stored value is encrypted. an unmarked value is plaintext, and a later scheme bumps the number
const CIPHERTEXT_PREFIX = PRIVATE_TEXT_PREFIX

// AES-GCM's nonce and auth tag widths, fixed by the algorithm
const ENCRYPTION_OVERHEAD_BYTES = PRIVATE_TEXT_OVERHEAD_BYTES

/**
 * Encrypt one chat turn's text for storage with AES-256-GCM under the environment's key.
 * With no key configured, the text stores as plaintext.
 */
export function encryptChatText(plainText: string): string {
	// no key means no encryption, which keeps a keyless self-host working
	if (!Bun.env.CHAT_TEXT_KEY) {
		if (Bun.env.DOPPLER_ENVIRONMENT && Bun.env.DOPPLER_ENVIRONMENT !== "dev") {
			throw new Error("CHAT_TEXT_KEY must be set outside dev, or chat text would be stored as plaintext")
		}
		return plainText
	}

	return encryptPrivateText(plainText)
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

	// report a verification failure without private bytes or key material
	const plainText = decryptPrivateText(storedText)
	if (plainText === null) {
		reportError(new Error("chat text failed to decrypt"), "chat")
	}
	return plainText
}

/**
 * Returns SQL for the most characters a stored chat text column decrypts to, read from its stored length alone: an
 * encrypted value's base64 bytes less the nonce and the tag, or a plaintext value's own length. A character is at
 * least one byte, so the result is never below the decrypted length.
 */
export function toDecryptedLengthSql(storedTextColumn: SQLWrapper): SQL<number> {
	const prefixLength = CIPHERTEXT_PREFIX.length
	return sql<number>`case when left(${storedTextColumn}, ${prefixLength}) = ${CIPHERTEXT_PREFIX}
		then (length(${storedTextColumn}) - ${prefixLength}) * 3 / 4 - ${ENCRYPTION_OVERHEAD_BYTES}
		else length(${storedTextColumn}) end`
}

/**
 * Encrypts one json value for storage, the value that decryptChatJson reads back.
 */
export function encryptChatJson(value: unknown): string {
	return encryptChatText(JSON.stringify(value))
}

/**
 * Decrypts one stored json value and parses it, or returns null if the value is missing, does not decrypt, or is not
 * json.
 */
export function decryptChatJson(storedText: string | null): unknown {
	// a missing value or one that fails to decrypt has nothing to parse
	const decryptedText = storedText === null ? null : decryptChatText(storedText)
	if (decryptedText === null) {
		return null
	}

	// treat text that fails to parse as no value
	try {
		return JSON.parse(decryptedText)
	} catch {
		return null
	}
}
