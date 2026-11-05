import { expect, test } from "bun:test"
import { redactEvent } from "./monitoringRedaction"
import { toReportedEvent } from "./visitAnalytics"

test("monitoring drops signed audio queries and private feed tokens", () => {
	// attach both private URL forms to request, event, and span fields
	const audioUrl = "https://media.example/audio.mp3?X-Amz-Signature=private-signature"
	const feedUrl = "https://carlnotes.example/podcast-feeds/private-token.xml"
	const event = redactEvent({
		request: { url: audioUrl },
		extra: { audioUrl, feedUrl },
		spans: [{ data: { url: feedUrl } }],
	})
	// verify monitoring and analytics remove the credentials
	expect(JSON.stringify(event)).not.toContain("private-signature")
	expect(JSON.stringify(event)).not.toContain("private-token")
	const analytics = toReportedEvent({ properties: { audioUrl, feedUrl } })
	expect(JSON.stringify(analytics)).not.toContain("private-signature")
	expect(JSON.stringify(analytics)).not.toContain("private-token")
})

test("monitoring replaces a push token quoted in an error, a message, or an attached field", () => {
	// the push service quotes the token in its error, and a caller attaches it
	const token = "ExponentPushToken[private-push-token]"
	const event = redactEvent({
		message: `push to ${token} failed`,
		exception: { values: [{ value: `"${token}" is not a registered push notification recipient` }] },
		extra: { pushDevice: { expoPushToken: token }, pushUrl: `https://exp.host/${token}`, pushErrors: [`bad ${token}`] },
	})

	// every copy is replaced and the rest of the text stays readable
	expect(JSON.stringify(event)).not.toContain("private-push-token")
	expect(event.message).toBe("push to ExpoPushToken[:token] failed")
})

test("monitoring drops a spoken question's transcript attached to an event", () => {
	// attach a transcript beside a duration, and keep only the duration
	const event = redactEvent({ extra: { transcript: "private spoken question", durationMs: 1_200 } })
	expect<unknown>(event.extra).toEqual({ durationMs: 1_200 })
})

test("personalSources secrets and private bodies never reach monitoring", () => {
	// provider errors, request headers, and nested context each exercise a separate leak boundary
	const secret = `cnk_v1_${"a".repeat(32)}_${"b".repeat(43)}`
	const event = redactEvent({
		message: `send with ${secret}`,
		exception: { values: [{ value: secret }] },
		request: {
			headers: { Authorization: `Bearer ${secret}`, Cookie: "private-session" },
			data: { summary: "private-canary" },
		},
		extra: {
			nested: {
				summary: "private-canary",
				sender: "reader@example.com",
				secret,
				chatUrl: "https://claude.ai/chat/private",
				count: 2,
			},
		},
	})
	const serialized = JSON.stringify(event)
	for (const forbidden of [secret, "private-canary", "reader@example.com", "private-session", "/chat/private"]) {
		expect(serialized).not.toContain(forbidden)
	}
	expect(serialized).toContain('"count":2')
})
