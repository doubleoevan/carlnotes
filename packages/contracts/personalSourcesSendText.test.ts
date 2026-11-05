// cards and text-only MCP hosts share the same plain ceiling refusal
import { expect, test } from "bun:test"
import { toPersonalSourcesSendText } from "./personalSourcesSendText"

test("a daily ceiling refusal states the limit and reset without suggesting an upgrade", () => {
	const text = toPersonalSourcesSendText({ status: "quota", resetAt: "2026-11-04T00:00:00.000Z" })
	expect(text).toBe("The day's limit is reached. It resets at 2026-11-04T00:00:00.000Z. Nothing was saved.")
})
