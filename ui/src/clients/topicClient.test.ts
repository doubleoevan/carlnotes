// topic client tests: a manual scan rejected because of a spent budget returns "budget", a started scan returns the
// scans left today, and a topic page or a podcast episode page response names the gate in front of its topic
import { afterEach, expect, test } from "bun:test"
import { SCAN_SPENT_BUDGET_LABEL } from "@shared/scanFailure"
import { fetchPodcastEpisodePage } from "./podcastEpisodeClient"
import { fetchTopicPage, sendManualScan } from "./topicClient"

// the real fetch to put back after each test
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
})

// a 402 from the scan route is a spent budget, and a started scan returns the scans left today
test("sendManualScan maps a 402 to budget and returns the scans left on a start", async () => {
	// the scan route rejects the scan because of the budget
	globalThis.fetch = (async () =>
		Response.json({ error: SCAN_SPENT_BUDGET_LABEL }, { status: 402 })) as unknown as typeof fetch
	expect(await sendManualScan("topic-1")).toBe("budget")

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
