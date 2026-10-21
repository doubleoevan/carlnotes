// topic client tests: a spent budget returns "budget", the manual scans cutoff "paused", and a started scan the scans
// left, a topic or podcast episode page names the gate in front of its topic, and the topic search returns the matched
// topics
import { afterEach, expect, test } from "bun:test"
import { MANUAL_SCAN_PAUSED_LABEL, SCAN_SPENT_BUDGET_LABEL } from "@carlnotes/contracts/scanFailure"
import { fetchPodcastEpisodePage } from "./podcastEpisodeClient"
import { fetchTopicPage, searchTopics, sendManualScan } from "./topicClient"

// the real fetch to put back after each test
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
})

// a 402 from the scan route is a spent budget unless it has the paused label, and a started scan returns the scans
// left today
test("sendManualScan maps a 402 to budget or paused and returns the scans left on a start", async () => {
	// the scan route rejects the scan because of the budget
	globalThis.fetch = (async () =>
		Response.json({ error: SCAN_SPENT_BUDGET_LABEL }, { status: 402 })) as unknown as typeof fetch
	expect(await sendManualScan("topic-1")).toBe("budget")

	// the scan route rejects the scan because of the manual scans cutoff
	globalThis.fetch = (async () =>
		Response.json({ error: MANUAL_SCAN_PAUSED_LABEL }, { status: 402 })) as unknown as typeof fetch
	expect(await sendManualScan("topic-1")).toBe("paused")

	// the scan route starts the scan
	globalThis.fetch = (async () => Response.json({ remainingScans: 3 })) as unknown as typeof fetch
	expect(await sendManualScan("topic-1")).toBe(3)
})

// stub every fetch with one response
function stubFetch(response: Response): void {
	globalThis.fetch = (async () => response) as unknown as typeof fetch
}

// both pages read the same gate, and a private topic's gate never names the topic
test("a topic page and a podcast episode page read the topic gate from a 403, and nothing else", async () => {
	// a private topic's gate has no name, and an invite topic's gate has its name
	stubFetch(Response.json({ error: "forbidden", gatedVisibility: "private", topicName: null }, { status: 403 }))
	expect(await fetchTopicPage("topic-1")).toEqual({
		status: "gated",
		topicGate: { visibility: "private", topicName: null },
	})
	stubFetch(
		Response.json({ error: "forbidden", gatedVisibility: "invite", topicName: "Quiet espresso" }, { status: 403 }),
	)
	expect(await fetchPodcastEpisodePage({ topicId: "topic-1", season: "2026", episodeNumber: "1" })).toEqual({
		status: "gated",
		topicGate: { visibility: "invite", topicName: "Quiet espresso" },
	})

	// a name that is not text is left out, and an unknown visibility is a missing topic
	stubFetch(Response.json({ error: "forbidden", gatedVisibility: "invite", topicName: 7 }, { status: 403 }))
	expect(await fetchTopicPage("topic-1")).toEqual({
		status: "gated",
		topicGate: { visibility: "invite", topicName: null },
	})
	stubFetch(
		Response.json({ error: "forbidden", gatedVisibility: "public", topicName: "Quiet espresso" }, { status: 403 }),
	)
	expect(await fetchTopicPage("topic-1")).toEqual({ status: "missing" })

	// a 404, or a body that is not JSON, is a missing page
	stubFetch(new Response("not found", { status: 404 }))
	expect(await fetchPodcastEpisodePage({ topicId: "topic-1", season: "2026", episodeNumber: "1" })).toEqual({
		status: "missing",
	})
})

// the topic search sends the query to the search route and returns its topics, or none on a failure
test("searchTopics sends the query and returns the matched topics", async () => {
	// the search route returns one topic, with the request url recorded
	let requestedUrl = ""
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		requestedUrl = String(input instanceof Request ? input.url : input)
		return Response.json({ topics: [{ id: "topic-1", name: "Agents" }] })
	}) as unknown as typeof fetch
	expect(await searchTopics("agents")).toEqual([{ id: "topic-1", name: "Agents" }])
	expect(requestedUrl).toContain("/api/topics/search?q=agents")

	// a failed search returns no topics
	stubFetch(new Response(null, { status: 500 }))
	expect(await searchTopics("agents")).toEqual([])
})
