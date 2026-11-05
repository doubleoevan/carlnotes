// private storage rejects plaintext, missing keys, malformed values, and tampering
import { afterEach, expect, test } from "bun:test"
import { createCipheriv } from "node:crypto"
import { decryptPrivateText, encryptPrivateText } from "./privateText"
import { saveEnvSettings } from "./savedEnvSettings"

// restore the caller's environment after every test
const restoreEnvSettings = saveEnvSettings(["CHAT_TEXT_KEY", "DOPPLER_ENVIRONMENT"])
afterEach(restoreEnvSettings)

test("private content never falls back to plaintext, including development", () => {
	delete Bun.env.CHAT_TEXT_KEY
	Bun.env.DOPPLER_ENVIRONMENT = "dev"
	expect(() => encryptPrivateText("private canary")).toThrow("required")
	expect(decryptPrivateText("private canary")).toBeNull()
	Bun.env.CHAT_TEXT_KEY = "not a key"
	expect(() => encryptPrivateText("private canary")).toThrow("32 bytes")
})

test("private text uses unique nonces and refuses altered ciphertext or keys", () => {
	Bun.env.CHAT_TEXT_KEY = Buffer.alloc(32, 7).toString("base64")
	const encryptedText = encryptPrivateText("private canary 🦉")
	expect(encryptedText).not.toContain("canary")
	expect(encryptPrivateText("private canary 🦉")).not.toBe(encryptedText)
	expect(decryptPrivateText(encryptedText)).toBe("private canary 🦉")
	expect(decryptPrivateText(`${encryptedText.slice(0, -4)}AAAA`)).toBeNull()
	expect(decryptPrivateText("enc1:AAAA")).toBeNull()
	expect(decryptPrivateText(`${encryptedText}!`)).toBeNull()
	Bun.env.CHAT_TEXT_KEY = Buffer.alloc(32, 8).toString("base64")
	expect(decryptPrivateText(encryptedText)).toBeNull()
	delete Bun.env.CHAT_TEXT_KEY
	expect(decryptPrivateText(encryptedText)).toBeNull()
})

test("the existing chat framing decrypts without rewriting stored rows", () => {
	// produce a fixture independently using the original nonce/tag/ciphertext layout
	const key = Buffer.alloc(32, 7)
	const nonce = Buffer.alloc(12, 9)
	const cipher = createCipheriv("aes-256-gcm", key, nonce)
	const ciphertext = Buffer.concat([cipher.update("legacy chat", "utf8"), cipher.final()])
	const legacyText = `enc1:${Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64")}`
	Bun.env.CHAT_TEXT_KEY = key.toString("base64")
	expect(decryptPrivateText(legacyText)).toBe("legacy chat")
})
