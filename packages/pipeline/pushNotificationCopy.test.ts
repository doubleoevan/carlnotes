// push copy tests: the count reads singular and plural with the first title, a long title is cut at a word, and a
// chat mention push says who mentioned or replied
import { expect, test } from "bun:test"
import { toChatMentionPushBody, toScanPushBody } from "./pushNotificationCopy"

// one Finding is quoted as the push, and several start with the first
test("a Topic push counts the new Findings and quotes the first", () => {
	expect(toScanPushBody(1, "A cheaper grinder burr")).toBe("1 new finding: “A cheaper grinder burr”")
	expect(toScanPushBody(2, "A cheaper grinder burr")).toBe("2 new findings, including “A cheaper grinder burr”")
	expect(toScanPushBody(3, null)).toBe("3 new findings")
	expect(toScanPushBody(3, "   ")).toBe("3 new findings")
})

// a long title ends at the last whole word inside the limit, with an ellipsis
test("a long Finding title is cut at a word", () => {
	const longTitle = `${"espresso ".repeat(20)}ends here`
	const body = toScanPushBody(2, longTitle)
	const quotedTitle = body.slice(body.indexOf("“") + 1, body.lastIndexOf("”"))
	expect(quotedTitle.endsWith("espresso…")).toBe(true)
	expect(quotedTitle.length).toBeLessThanOrEqual(120)
	expect(new TextEncoder().encode(body).length).toBeLessThan(4096)
})

// a mention and a reply each name the sender, and never the message
test("a chat mention push names the sender", () => {
	expect(toChatMentionPushBody("alex", false)).toBe("alex mentioned you")
	expect(toChatMentionPushBody("alex", true)).toBe("alex replied to you")
})
