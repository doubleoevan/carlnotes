// topic client tests: a spent budget returns "budget", the manual scans cutoff "paused", and a started scan the scans
// left, a topic or podcast episode page names the gate in front of its topic, and the topic search returns the matched
// topics
import { afterEach, expect, test } from "bun:test"
import { MANUAL_SCAN_PAUSED_LABEL, SCAN_SPENT_BUDGET_LABEL } from "@carlnotes/contracts/scanFailure"
import { configureApiClient } from "./apiClient"
import { stubFetch } from "./fetchTestFixtures"
import { fetchPodcastEpisodePage } from "./podcastEpisodeClient"
import { fetchTopicAttachment, fetchTopicPage, sendAcceptInvite, sendManualScan } from "./topicClient"

// the real fetch to put back after each test
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

test("attachment downloads preserve native session headers and reject forbidden content", async () => {
	// download through the configured client instead of a browser's separate cookie jar
	configureApiClient({
		apiBaseUrl: "https://attachments.test",
		headers: () => ({ Cookie: "test-session=owner" }),
		showError: () => {},
	})
	// the url the download asked for, and the session header it sent
	let downloadUrl = ""
	const sessionHeaders: (string | null)[] = []
	globalThis.fetch = (async (input, init) => {
		downloadUrl = String(input)
		sessionHeaders.push(new Headers(init?.headers).get("Cookie"))
		return new Response(new Uint8Array([1, 2, 3]))
	}) as typeof fetch
	// the bytes, the url, and the session header
	expect(await fetchTopicAttachment("file-one")).toEqual(new Uint8Array([1, 2, 3]))
	expect(downloadUrl).toBe("https://attachments.test/api/attachments/file-one/download")
	expect(sessionHeaders).toEqual(["test-session=owner"])

	// leave an access failure visible and never pass its response body to the file viewer
	stubFetch(Response.json({ error: "forbidden" }, { status: 403 }))
	await expect(fetchTopicAttachment("file-one")).rejects.toThrow("forbidden")
})

// a 402 from the scan route is a spent budget unless it has the paused label, and a started scan returns the scans
// left today
test("sendManualScan maps a 402 to budget or paused and returns the scans left on a start", async () => {
	// the scan route rejects the scan because of the budget
	stubFetch(Response.json({ error: SCAN_SPENT_BUDGET_LABEL }, { status: 402 }))
	expect(await sendManualScan("topic-1")).toBe("budget")

	// the scan route rejects the scan because of the manual scans cutoff
	stubFetch(Response.json({ error: MANUAL_SCAN_PAUSED_LABEL }, { status: 402 }))
	expect(await sendManualScan("topic-1")).toBe("paused")

	// the scan route starts the scan
	stubFetch(Response.json({ remainingScans: 3 }))
	expect(await sendManualScan("topic-1")).toBe(3)
})

// both pages read the same gate, which names the invite topic
test("a topic page and a podcast episode page read the topic gate from a 403, and nothing else", async () => {
	// an invite topic's gate has its name on either page
	const inviteGateBody = { error: "forbidden", gatedVisibility: "invite", topicName: "Quiet espresso" }
	stubFetch(Response.json(inviteGateBody, { status: 403 }))
	expect(await fetchTopicPage("topic-1")).toEqual({ status: "gated", topicGate: { topicName: "Quiet espresso" } })
	stubFetch(Response.json(inviteGateBody, { status: 403 }))
	expect(await fetchPodcastEpisodePage({ topicId: "topic-1", season: "2026", episodeNumber: "1" })).toEqual({
		status: "gated",
		topicGate: { topicName: "Quiet espresso" },
	})

	// a name that is not text is left out, and a body that names a private topic is a missing topic
	stubFetch(Response.json({ ...inviteGateBody, topicName: 7 }, { status: 403 }))
	expect(await fetchTopicPage("topic-1")).toEqual({ status: "gated", topicGate: { topicName: null } })
	stubFetch(Response.json({ ...inviteGateBody, gatedVisibility: "private" }, { status: 403 }))
	expect(await fetchTopicPage("topic-1")).toEqual({ status: "missing" })

	// a 404, or a body that is not JSON, is a missing page
	stubFetch(new Response("not found", { status: 404 }))
	expect(await fetchPodcastEpisodePage({ topicId: "topic-1", season: "2026", episodeNumber: "1" })).toEqual({
		status: "missing",
	})

	// any other rejection throws, so the podcast episode screen shows its error state instead of a missing episode
	stubFetch(new Response(null, { status: 500 }))
	await expect(
		fetchPodcastEpisodePage({ topicId: "topic-1", season: "2026", episodeNumber: "1" }),
	).rejects.toMatchObject({ status: 500 })
})

// a visitor's 401 is an unknown token, a rejection the route names comes in the body, and any other rejected status
// throws so the invite screen offers its retry
test("sendAcceptInvite reads a 401 as an unknown token and throws on any other rejection", async () => {
	stubFetch(Response.json({ error: "unauthorized" }, { status: 401 }))
	expect(await sendAcceptInvite("token")).toEqual({ status: "unknown" })
	stubFetch(Response.json({ status: "expired" }))
	expect(await sendAcceptInvite("token")).toEqual({ status: "expired" })

	// a server error
	stubFetch(new Response(null, { status: 500 }))
	await expect(sendAcceptInvite("token")).rejects.toThrow("invite accept failed: 500")
})
