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
