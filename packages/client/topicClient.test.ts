// topic client tests: a spent budget returns "budget", the manual scans cutoff "paused", and a started scan the scans
// left, a topic or podcast episode page names the gate in front of its topic, and the topic search returns the matched
// topics
import { afterEach, expect, test } from "bun:test"
import { MANUAL_SCAN_PAUSED_LABEL, SCAN_SPENT_BUDGET_LABEL } from "@carlnotes/contracts/scanFailure"
import { stubFetch } from "./fetchTestFixtures"
import { fetchPodcastEpisodePage } from "./podcastEpisodeClient"
import { fetchTopicPage, sendManualScan } from "./topicClient"

// the real fetch to put back after each test
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
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
})
