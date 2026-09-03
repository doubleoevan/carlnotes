// tests how to show a failed Resend email error, and how the batch sender chunks and reports acceptance
import { afterEach, expect, test } from "bun:test"
import { type EmailMessage, sendEmailBatches, toResendErrorName } from "./email"

test("toResendErrorName reads the error name and handles a body it cannot parse", () => {
	expect(toResendErrorName('{"statusCode":422,"name":"validation_error","message":"..."}')).toBe("validation_error")
	expect(toResendErrorName('{"statusCode":500}')).toBe("an unnamed error")
	expect(toResendErrorName("<html>502 Bad Gateway</html>")).toBe("an unparsed error")
	expect(toResendErrorName("")).toBe("an unparsed error")
})

// a message factory for the batch tests, numbered so that each recipient is different
function toTestMessage(index: number): EmailMessage {
	return { to: `user${index}@example.com`, subject: "s", emailContent: "<p>hi</p>", emailKind: "topic-scan" }
}

// the real fetch and env, restored after each batch test so that nothing leaks into other tests
const realFetch = globalThis.fetch
const realApiKey = Bun.env.RESEND_API_KEY
const realFromEmail = Bun.env.RESEND_FROM_EMAIL
afterEach(() => {
	globalThis.fetch = realFetch
	Bun.env.RESEND_API_KEY = realApiKey
	Bun.env.RESEND_FROM_EMAIL = realFromEmail
})

test("sendEmailBatch returns nothing for no messages and all false without config", async () => {
	// an empty batch makes no call and needs no config
	expect(await sendEmailBatches([])).toEqual([])

	// without an api key and from-address, every message reports not accepted
	delete Bun.env.RESEND_API_KEY
	delete Bun.env.RESEND_FROM_EMAIL
	expect(await sendEmailBatches([toTestMessage(1), toTestMessage(2)])).toEqual([false, false])
})

test("sendEmailBatch chunks at 100 per call and flags every message accepted", async () => {
	// a configured sender whose fetch records each batch call's payload size
	Bun.env.RESEND_API_KEY = "test-key"
	Bun.env.RESEND_FROM_EMAIL = "carl@example.com"
	const batchSizes: number[] = []
	globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
		batchSizes.push((JSON.parse(String(init?.body)) as unknown[]).length)
		return new Response(JSON.stringify({ data: [] }), { status: 200 })
	}) as typeof fetch

	// 205 messages split into calls of 100, 100, and 5, each message flagged accepted
	const messages = Array.from({ length: 205 }, (_, index) => toTestMessage(index))
	const accepted = await sendEmailBatches(messages)
	expect(batchSizes).toEqual([100, 100, 5])
	expect(accepted).toHaveLength(205)
	expect(accepted.every(Boolean)).toBe(true)
})

// resend rejects a whole batch over one address it will not take, so an unsendable one is held back
test("an unsendable address is held back instead of failing the batch", async () => {
	Bun.env.RESEND_API_KEY = "test-key"
	Bun.env.RESEND_FROM_EMAIL = "carl@example.com"
	const sentAddresses: string[] = []
	globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
		// record every address resend was actually posted, which is what this test asserts on
		const body = JSON.parse(String(init?.body)) as { to: string }[]
		sentAddresses.push(...body.map((email) => email.to))
		return new Response(JSON.stringify({ data: body.map(() => ({ id: "x" })) }), { status: 200 })
	}) as typeof fetch

	// the bad address never reaches resend, and its own flag is false while the others are true
	const messages = [toTestMessage(1), { ...toTestMessage(2), to: "not-an-address" }, toTestMessage(3)]
	const accepted = await sendEmailBatches(messages)
	expect(sentAddresses).toEqual(["user1@example.com", "user3@example.com"])
	expect(accepted).toEqual([true, false, true])
})
