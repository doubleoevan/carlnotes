// verify recipient routing follows the configured receiving mailbox
import { afterEach, expect, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { isPersonalSourcesRecipient } from "./personalSourcesEmailReceipts"

// restore configuration after each recipient boundary check
const restoreEnv = saveEnvSettings(["RESEND_FROM_EMAIL"])
afterEach(restoreEnv)

test("development accepts only its configured shared mailbox", () => {
	// select a development mailbox and normalize recipient casing
	Bun.env.RESEND_FROM_EMAIL = "Carl <carl@inbox-dev.example.com>"
	expect(isPersonalSourcesRecipient(" Carl@Inbox-Dev.example.com ")).toBe(true)

	// reject the production mailbox, other names, and display-name addresses
	for (const recipient of ["carl@example.com", "other@inbox-dev.example.com", "Carl <carl@inbox-dev.example.com>"]) {
		expect(isPersonalSourcesRecipient(recipient)).toBe(false)
	}
})

test("production accepts its configured mailbox", () => {
	// isolate production routing from the development mailbox
	Bun.env.RESEND_FROM_EMAIL = "carl@example.com"
	expect(isPersonalSourcesRecipient("carl@example.com")).toBe(true)
	expect(isPersonalSourcesRecipient("carl@inbox-dev.example.com")).toBe(false)
})
