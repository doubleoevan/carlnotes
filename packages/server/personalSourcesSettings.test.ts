// the environment owns one receiving mailbox shared by every sender and Topic
import { afterEach, beforeEach, expect, test } from "bun:test"
import { readPersonalSourcesEmailAddress, validatePersonalSourcesEmailSettings } from "./personalSourcesSettings"
import { saveEnvSettings } from "./savedEnvSettings"

// keep test mailbox settings local to each fixture
const restore = saveEnvSettings([
	"RESEND_FROM_EMAIL",
	"PERSONAL_SOURCES_RECEIVING_ENABLED",
	"PERSONAL_SOURCES_EMAIL_ENABLED",
])
beforeEach(() => {
	Bun.env.PERSONAL_SOURCES_RECEIVING_ENABLED = "true"
	Bun.env.PERSONAL_SOURCES_EMAIL_ENABLED = "true"
})
afterEach(restore)

test("receiving follows the topic scan email mailbox, including a display name", () => {
	for (const from of [" Carl@example.com ", "Carl Notes <Carl@example.com>"]) {
		Bun.env.RESEND_FROM_EMAIL = from
		expect(readPersonalSourcesEmailAddress()).toBe("carl@example.com")
		expect(() => validatePersonalSourcesEmailSettings()).not.toThrow()
	}
})

test("enabled receiving rejects missing, multiple, and invalid mailboxes", () => {
	for (const address of [
		undefined,
		"",
		"not-an-address",
		"Carl <carl@example.com>\r\nBcc: other@example.com",
		"first@example.com,second@example.com",
		"first@example.com, Carl <second@example.com>",
	]) {
		// set or clear the address, then expect the rejection
		if (address === undefined) {
			delete Bun.env.RESEND_FROM_EMAIL
		} else {
			Bun.env.RESEND_FROM_EMAIL = address
		}
		expect(() => validatePersonalSourcesEmailSettings()).toThrow("RESEND_FROM_EMAIL")
	}
})

test("disabled receiving does not need a mailbox", () => {
	delete Bun.env.RESEND_FROM_EMAIL
	Bun.env.PERSONAL_SOURCES_EMAIL_ENABLED = "false"
	expect(() => validatePersonalSourcesEmailSettings()).not.toThrow()
})
