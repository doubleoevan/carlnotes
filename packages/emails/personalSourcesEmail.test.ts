// the real email adapter shares one sender, receiving, and reply mailbox
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as limiter from "@carlnotes/db/resendRateLimit"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { sendPersonalSourcesEmailReply } from "./personalSourcesEmail"

const originalFetch = globalThis.fetch
const restoreEnv = saveEnvSettings(["RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_REPLY_EMAIL"])
const emailId = "2d806990-3a10-4cec-bdc8-c0195ae2ebff"
beforeEach(() => {
	Bun.env.RESEND_API_KEY = "test-key"
	Bun.env.RESEND_FROM_EMAIL = "Carl Notes <notes@example.com>"
	Bun.env.RESEND_REPLY_EMAIL = "support@example.com"
	spyOn(limiter, "waitForResendSlot").mockResolvedValue()
})
afterEach(() => {
	globalThis.fetch = originalFetch
	restoreEnv()
	mock.restore()
})

for (const from of ["notes@example.com", "Carl Notes <notes@example.com>"]) {
	test(`Carl uses the configured mailbox and shared Reply-To for ${from}`, async () => {
		Bun.env.RESEND_FROM_EMAIL = from
		const calls: { url: string; init?: RequestInit }[] = []
		globalThis.fetch = (async (url, init) => {
			calls.push({ url: String(url), init })
			return Response.json(
				init?.method === "POST" ? { id: emailId } : { id: emailId, message_id: "<actual-provider-id@resend.dev>" },
			)
		}) as typeof fetch
		expect(
			await sendPersonalSourcesEmailReply({
				confirmationId: "confirmation",
				to: "owner@example.com",
				reply: {
					kind: "needs_topic",
					inReplyTo: "<original@example.com>",
					subject: "Re: Coffee",
					requestId: "9101167a-feda-432b-ae30-ab25e98ff350",
				},
			}),
		).toEqual({ outcome: "accepted" })
		const body = JSON.parse(String(calls[0]?.init?.body))
		expect(body.from).toBe("Carl <notes@example.com>")
		expect(body.reply_to).toBe("notes@example.com")
		expect(body.text).toContain("Reply with the name")
		expect(body.headers["Auto-Submitted"]).toBe("auto-replied")
		expect(body.headers["In-Reply-To"]).toBe("<original@example.com>")
		expect(body.headers.References).toBe("<original@example.com>")
		expect(body.subject).toBe("Re: Coffee")
		expect(body.headers["Message-ID"]).toBeUndefined()
		expect(calls).toHaveLength(1)
	})
}

test("provider failure retries the identical send key without a second metadata request", async () => {
	const keys: string[] = []
	let providerReady = false
	globalThis.fetch = (async (_url, init) => {
		expect(init?.method).toBe("POST")
		keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "")
		return providerReady ? Response.json({ id: emailId }) : new Response("", { status: 503 })
	}) as typeof fetch
	// the failed send and its retry use one key
	const delivery = { confirmationId: "confirmation", to: "owner@example.com", reply: { kind: "needs_topic" as const } }
	expect((await sendPersonalSourcesEmailReply(delivery)).outcome).toBe("retryable")
	providerReady = true
	expect((await sendPersonalSourcesEmailReply(delivery)).outcome).toBe("accepted")
	expect(keys).toEqual(["personal-sources/confirmation", "personal-sources/confirmation"])
})
