// provider boundary tests use signed synthetic payloads and local response streams
import { afterEach, expect, test } from "bun:test"
import { normalizePersonalSourcesEmail } from "./personalSourcesEmailContent"
import {
	FIXTURE_EMAIL_ID,
	FIXTURE_PERSONAL_SOURCES_ADDRESS,
	FIXTURE_WEBHOOK_SECRET,
	personalSourcesEmailFixture,
	signedPersonalSourcesWebhook,
} from "./personalSourcesEmailTestFixtures"
import { fetchReceivedPersonalSourcesEmail, verifyResendInbound } from "./resendInbound"
import { saveEnvSettings } from "./savedEnvSettings"

const restoreEnvSettings = saveEnvSettings(["RESEND_API_KEY", "RESEND_INBOUND_WEBHOOK_SECRET"])
const originalFetch = globalThis.fetch
afterEach(() => {
	restoreEnvSettings()
	globalThis.fetch = originalFetch
})

test("raw-body verification refuses absent, modified, stale, future, and wrong-event signatures", () => {
	Bun.env.RESEND_INBOUND_WEBHOOK_SECRET = FIXTURE_WEBHOOK_SECRET
	const body = JSON.stringify({
		type: "email.received",
		data: { from: "owner@example.com", email_id: FIXTURE_EMAIL_ID, to: [FIXTURE_PERSONAL_SOURCES_ADDRESS] },
	})
	expect(verifyResendInbound({ body, headers: signedPersonalSourcesWebhook(body) })?.data.email_id).toBe(
		FIXTURE_EMAIL_ID,
	)
	expect(verifyResendInbound({ body, headers: new Headers() })).toBeNull()
	expect(verifyResendInbound({ body: `${body} `, headers: signedPersonalSourcesWebhook(body) })).toBeNull()
	for (const offset of [-600_000, 600_000]) {
		expect(
			verifyResendInbound({ body, headers: signedPersonalSourcesWebhook(body, new Date(Date.now() + offset)) }),
		).toBeNull()
	}
	const wrongEvent = body.replace("email.received", "email.sent")
	expect(verifyResendInbound({ body: wrongEvent, headers: signedPersonalSourcesWebhook(wrongEvent) })).toBeNull()
})

test("retrieval uses only the fixed receiving endpoint and discards download fields", async () => {
	Bun.env.RESEND_API_KEY = "fixture-provider-key"
	const requests: string[] = []
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		requests.push(String(input))
		expect(init?.redirect).toBe("error")
		expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-provider-key")
		return Response.json({
			...personalSourcesEmailFixture(),
			raw: { download_url: "http://127.0.0.1/raw" },
			attachments: [{ download_url: "http://169.254.169.254/secret" }],
		})
	}) as unknown as typeof fetch
	const result = await fetchReceivedPersonalSourcesEmail(FIXTURE_EMAIL_ID)
	expect(result.status).toBe("received")
	expect(JSON.stringify(result)).not.toContain("download_url")
	expect(requests).toEqual([`https://api.resend.com/emails/receiving/${FIXTURE_EMAIL_ID}?html_format=cid`])
	expect(await fetchReceivedPersonalSourcesEmail("../../emails")).toEqual({ status: "refused" })
	expect(requests).toHaveLength(1)
})

test("provider failures retry only transient outcomes and oversized streams are cancelled", async () => {
	Bun.env.RESEND_API_KEY = "fixture-provider-key"
	for (const status of [400, 401, 403, 404, 429, 500, 503]) {
		globalThis.fetch = (async () => new Response(null, { status })) as unknown as typeof fetch
		expect((await fetchReceivedPersonalSourcesEmail(FIXTURE_EMAIL_ID)).status).toBe(
			status >= 500 || status === 429 ? "retry" : "refused",
		)
	}
	globalThis.fetch = (async () => {
		throw new DOMException("private-canary", "TimeoutError")
	}) as unknown as typeof fetch
	expect(await fetchReceivedPersonalSourcesEmail(FIXTURE_EMAIL_ID)).toEqual({ status: "retry" })
	let isCancelled = false
	globalThis.fetch = (async () =>
		new Response(
			new ReadableStream({
				pull(controller) {
					controller.enqueue(new Uint8Array(1_000_001))
				},
				cancel() {
					isCancelled = true
				},
			}),
		)) as unknown as typeof fetch
	expect(await fetchReceivedPersonalSourcesEmail(FIXTURE_EMAIL_ID)).toEqual({ status: "refused" })
	expect(isCancelled).toBe(true)
})

test("Resend's structured list header retains newsletter provenance and excludes its unsubscribe URL", async () => {
	// the sanitized wire shape comes from the controlled live newsletter
	Bun.env.RESEND_API_KEY = "fixture-provider-key"
	globalThis.fetch = (async () =>
		Response.json(
			personalSourcesEmailFixture({
				text: "Read https://example.com/article and https://example.com/preferences",
				html: null,
				headers: {
					list: JSON.stringify({
						id: { name: "Fixture newsletter", id: "fixture.example.com" },
						unsubscribe: { url: "https://example.com/preferences", mail: "unsubscribe@example.com" },
					}),
				},
			}),
		)) as unknown as typeof fetch
	const receivedEmail = await fetchReceivedPersonalSourcesEmail(FIXTURE_EMAIL_ID)
	expect(receivedEmail.status).toBe("received")
	if (receivedEmail.status !== "received") {
		throw new Error("Fixture retrieval failed")
	}
	const normalizedEmail = normalizePersonalSourcesEmail({
		email: receivedEmail.email,
		ownerEmail: "owner@example.com",
		isOwnerEmailVerified: true,
	})
	expect(normalizedEmail.payload.senderKind).toBe("newsletter")
	expect(normalizedEmail.payload.links).toEqual(["https://example.com/article"])
})

test("malformed or unrecognized structured list headers cannot create newsletter provenance", async () => {
	Bun.env.RESEND_API_KEY = "fixture-provider-key"
	for (const list of [
		"not-json",
		"null",
		"[]",
		'{"id":"unrecognized"}',
		'{"unsubscribe":{"url":42}}',
		"x".repeat(10_001),
	]) {
		globalThis.fetch = (async () =>
			Response.json(personalSourcesEmailFixture({ headers: { list } }))) as unknown as typeof fetch
		const receivedEmail = await fetchReceivedPersonalSourcesEmail(FIXTURE_EMAIL_ID)
		expect(receivedEmail.status).toBe("received")
		if (receivedEmail.status !== "received") {
			throw new Error("Fixture retrieval failed")
		}
		expect(Object.keys(receivedEmail.email.headers)).toEqual(["list"])
	}
})
