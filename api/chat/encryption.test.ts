// chat text encryption tests. how stored text is written, read back, and refused when it fails to verify
import { expect, test } from "bun:test"
import { decryptChatText, encryptChatText } from "./encryption"
import { toChatTurnRow } from "./turns"

// a valid 32-byte key for the encryption cases, set around each case and always restored
const TEST_KEY = Buffer.alloc(32, 7).toString("base64")

// run a test case with the test encryption key, then restore the original key afterward
function withChatTextKey(run: () => void): void {
	const originalKey = Bun.env.CHAT_TEXT_KEY
	Bun.env.CHAT_TEXT_KEY = TEST_KEY
	try {
		run()
	} finally {
		// no key before means the keyless default is what to restore
		if (originalKey === undefined) {
			delete Bun.env.CHAT_TEXT_KEY
		} else {
			Bun.env.CHAT_TEXT_KEY = originalKey
		}
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
		const chatTurnRow = toChatTurnRow("user-1", "topic-1", 1000, 0, true, "who is hiring?", "four of them are")
		expect(String(chatTurnRow.question).startsWith("enc1:")).toBe(true)
		expect(decryptChatText(String(chatTurnRow.answer))).toBe("four of them are")
	})
})
