// the home payload holds the first page of a user's topics, and a later page is requested when the user opens it
import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import type { TopicCard, YourTopicsPage } from "@carlnotes/contracts/home"
import { useYourTopicsPages } from "@carlnotes/core/hooks/useYourTopicsPages"
import { act } from "react"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// restore the real fetch even after a failed assertion
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: console.error })
})

// a topic card named and keyed by its id
function toTopicCard(id: string): TopicCard {
	return {
		id,
		name: id,
		path: `/topics/${id}`,
		image: null,
		tags: [],
		owner: null,
		teamLink: null,
		reactionCount: 0,
		latestPodcastEpisode: null,
	}
}

test("the first page comes from the payload, and the second page is requested once opened", async () => {
	// seven topics in all, five on the first page and two on the second
	const firstPage: YourTopicsPage = { topics: ["a", "b", "c", "d", "e"].map(toTopicCard), totalCount: 7 }
	const secondPage: YourTopicsPage = { topics: ["f", "g"].map(toTopicCard), totalCount: 7 }
	const requestUrls: string[] = []
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
	globalThis.fetch = (async (url: RequestInfo | URL) => {
		requestUrls.push(String(url))
		return Response.json(secondPage)
	}) as typeof fetch

	// the first page shows without a request
	const harness = await renderTestHook(() => useYourTopicsPages(firstPage))
	expect(harness.read().pageTopics.map((topic) => topic.id)).toEqual(["a", "b", "c", "d", "e"])
	expect(harness.read().pagination.pageCount).toBe(2)
	expect(requestUrls).toEqual([])

	// opening the second page requests it once
	await act(async () => harness.read().pagination.setPage(1))
	await waitForHook(() => harness.read().pageTopics[0]?.id === "f")
	expect(harness.read().pageTopics.map((topic) => topic.id)).toEqual(["f", "g"])
	expect(requestUrls).toHaveLength(1)
	expect(requestUrls[0]).toContain("/api/home/your-topics?page=1")
	await harness.close()
})
