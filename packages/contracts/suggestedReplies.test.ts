// the suggested reply filter: a plain short line passes, and an email, a web address, a domain, a handle, an empty
// line, and a line past the limit are dropped
import { expect, test } from "bun:test"
import { SUGGESTED_REPLY_CHARS } from "./chat"
import { toSafeSuggestedReply } from "./suggestedReplies"

test("a plain short reply passes with its whitespace collapsed", () => {
	expect(toSafeSuggestedReply("  Weekly   is\nfine ")).toBe("Weekly is fine")
	expect(toSafeSuggestedReply("Yes, create it")).toBe("Yes, create it")
	expect(toSafeSuggestedReply("Skip invites for now")).toBe("Skip invites for now")
})

test("an email, a web address, a domain, and a handle are dropped", () => {
	for (const unsafeReply of [
		"Invite sam@example.com",
		"Add https://example.com/feed",
		"Add www.example.org",
		"Follow example.com for updates",
		"Ask @sam to join",
		"@carl make it public",
		"Add evil.de as a source",
		"Follow ＠carl",
		"Email sam＠example.de",
		"Add http:/evil.de",
		"Read news.bbc.co.uk",
	]) {
		expect(toSafeSuggestedReply(unsafeReply)).toBeNull()
	}
})

test("a dotted name is dropped even when it is no domain", () => {
	expect(toSafeSuggestedReply("Track Node.js 24 releases")).toBeNull()
	expect(toSafeSuggestedReply("Version 2.5 is fine")).toBe("Version 2.5 is fine")
	expect(toSafeSuggestedReply("Weekly. Thanks")).toBe("Weekly. Thanks")
})

test("an empty line and a line past the limit are dropped", () => {
	expect(toSafeSuggestedReply(null)).toBeNull()
	expect(toSafeSuggestedReply("   ")).toBeNull()
	expect(toSafeSuggestedReply("a".repeat(SUGGESTED_REPLY_CHARS + 1))).toBeNull()
	expect(toSafeSuggestedReply("a".repeat(SUGGESTED_REPLY_CHARS))).toBe("a".repeat(SUGGESTED_REPLY_CHARS))
})
