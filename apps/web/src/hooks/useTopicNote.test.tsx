// a row's Topic note reads its Topic once it opens, and reuses that read while it is fresh
import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { useTopicNote } from "@carlnotes/core/hooks/useTopicNote"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// release every environment even after a failed assertion
const originalFetch = globalThis.fetch
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: console.error })
})

test("a note reads its Topic once it opens, and a note opened again within a minute reads nothing", async () => {
	// a closed note reads nothing
	const readUrls = stubRequests(async () => Response.json(toTestTopicResponse({ id: "topic-1" })))
	const toTopicNote = (isOpen: boolean) => () => useTopicNote({ topicId: "topic-1", userId: "alice", isOpen })
	const harness = await renderTestHook(toTopicNote(false))
	cleanups.push(harness.close)
	expect(readUrls).toEqual([])

	// the open note reads the whole Topic page, related topics included, under the Topic page's cache key
	await harness.render(toTopicNote(true))
	await waitForHook(() => harness.read().topic !== null)
	expect(readUrls).toEqual(["https://test.example/api/topics/topic-1"])
	expect(harness.client.getQueryData(["topic-page", "alice", "topic-1"])).toMatchObject({ status: "visible" })

	// the note closes and opens again on the Topic it already read
	await harness.render(toTopicNote(false))
	await harness.render(toTopicNote(true))
	expect(harness.read()).toMatchObject({ topic: { id: "topic-1" }, isUnavailable: false })
	expect(readUrls).toHaveLength(1)
})

test("a Topic the reader may not open ends as unavailable", async () => {
	// open a visitor's note on a Topic that the api does not find
	stubRequests(async () => Response.json({ error: "not found" }, { status: 404 }))
	const harness = await renderTestHook(() => useTopicNote({ topicId: "topic-2", userId: null, isOpen: true }))
	cleanups.push(harness.close)

	// the note ends with no Topic
	await waitForHook(() => harness.read().isUnavailable)
	expect(harness.read().topic).toBeNull()
})

// answer every api request with the given response, and return the urls requested so far
function stubRequests(request: () => Promise<Response>): string[] {
	const requestedUrls: string[] = []
	configureApiClient({ apiBaseUrl: "https://test.example", showError: () => undefined })
	globalThis.fetch = ((input: RequestInfo | URL) => {
		requestedUrls.push(String(input))
		return request()
	}) as typeof fetch
	return requestedUrls
}
