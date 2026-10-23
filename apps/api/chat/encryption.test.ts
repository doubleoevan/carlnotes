// chat text encryption tests. how stored text is written, read back, and rejected when it fails to verify
import { expect, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { toChatTurnRow } from "./chatTurns"
import { decryptChatJson, decryptChatText, encryptChatJson, encryptChatText } from "./encryption"

// a valid 32-byte key for the encryption cases, set around each case and always restored
const TEST_KEY = Buffer.alloc(32, 7).toString("base64")

// run a test case with the test encryption key, then restore the original key afterward
function withChatTextKey(run: () => void): void {
	const restoreEnvSettings = saveEnvSettings(["CHAT_TEXT_KEY"])
	Bun.env.CHAT_TEXT_KEY = TEST_KEY

	// put the key back even if the case fails
	try {
		run()
	} finally {
		restoreEnvSettings()
	}
}

// with no key configured, the text passes through untouched in both directions
test("an unset key stores and reads plaintext", () => {
	expect(encryptChatText("plain words")).toBe("plain words")
	expect(decryptChatText("plain words")).toBe("plain words")
})

// with the key set, the chat text is encrypted ciphertext that round-trips back to the original
test("encrypted chat text round-trips and never stores plaintext", () => {
	withChatTextKey(() => {
		const storedChatText = encryptChatText("who is hiring?")
		expect(storedChatText.startsWith("enc1:")).toBe(true)
		expect(storedChatText).not.toContain("hiring")
		expect(decryptChatText(storedChatText)).toBe("who is hiring?")
	})
})

// text stored while the key was unset includes no marker, so it reads back as written instead of as unreadable
test("unmarked text passes through with the key set", () => {
	withChatTextKey(() => {
		expect(decryptChatText("stored with no key set")).toBe("stored with no key set")
	})
})

// the auth tag is checked on read, so a tampered row returns null instead of corrupted text
test("tampered ciphertext decrypts to null", () => {
	withChatTextKey(() => {
		const storedChatText = encryptChatText("who is hiring?")
		const tamperedChatText = `${storedChatText.slice(0, storedChatText.length - 4)}AAAA`
		expect(decryptChatText(tamperedChatText)).toBeNull()
	})
})

// a persisted chat turn row's text goes to storage encrypted, so the database never holds the readable conversation
test("a persisted chat turn's row stores ciphertext", () => {
	withChatTextKey(() => {
		const chatTurnRow = toChatTurnRow({
			userId: "user-1",
			page: { topicId: "topic-1" },
			totalTokens: 1000,
			searchCount: 0,
			isPersisted: true,
			question: "who is hiring?",
			answer: "four of them are",
			toolCalls: [],
			isSpoken: false,
		})
		expect(String(chatTurnRow.question).startsWith("enc1:")).toBe(true)
		expect(decryptChatText(String(chatTurnRow.answer))).toBe("four of them are")
	})
})

// a stored json value reads back parsed, and a missing value or text that is not json reads as null
test("decryptChatJson parses stored json and returns null for a missing or non-json value", () => {
	withChatTextKey(() => {
		expect(decryptChatJson(encryptChatJson({ frequency: "daily" }))).toEqual({ frequency: "daily" })
		expect(decryptChatJson(encryptChatText("not json"))).toBeNull()
		expect(decryptChatJson(null)).toBeNull()
	})
})

// the room estimate sums stored lengths in the database, reading an encrypted value as its base64 bytes less the
// marker, the nonce, and the tag. that arithmetic counts the base64 padding too, so it is the plaintext's bytes or up
// to two over, and a plaintext's bytes are never fewer than its characters
test("an encrypted value's stored length bounds its plaintext's characters from above", () => {
	withChatTextKey(() => {
		// an empty text, a short one, and a long one with multi-byte characters
		for (const plainText of ["", "a", "who is hiring?", "café ☕ ".repeat(300)]) {
			const storedText = encryptChatText(plainText)
			const decryptedBytes = Math.floor(((storedText.length - "enc1:".length) * 3) / 4) - 28
			expect(decryptedBytes - Buffer.byteLength(plainText)).toBeWithin(0, 3)
			expect(decryptedBytes).toBeGreaterThanOrEqual(plainText.length)
		}
	})
})
