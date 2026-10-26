import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import { toTestTopicFeedResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { TopicFeedResponse } from "@carlnotes/contracts/topics"
import { useTopicFindingActions } from "@carlnotes/core/hooks/useTopicFindingActions"
import { applyTopicFeedChanges } from "@carlnotes/core/lib/topicFindingChanges"
import { act } from "react"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// restore transport and release each hook's query client
const originalFetch = globalThis.fetch
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: console.error })
})

test("opening and bookmarking one finding overlap without dropping either action or repeating a write", async () => {
	// hold both writes independently of each other
	const openedWrite = Promise.withResolvers<Response>()
	const bookmarkWrite = Promise.withResolvers<Response>()
	const requests: string[] = []
	configureApiClient({ apiBaseUrl: "https://test.example", showError: () => undefined })
	globalThis.fetch = ((input: RequestInfo | URL) => {
		const url = String(input)
		requests.push(url)
		return url.endsWith("/view") ? openedWrite.promise : bookmarkWrite.promise
	}) as typeof fetch
	const harness = await renderTestHook(() =>
		useTopicFindingActions({ userId: "alice", shouldUpdateOptimistically: true }),
	)
	cleanups.push(harness.close)
	const feed = toTestTopicFeedResponse()
	harness.client.setQueryData(["topic-feed", "alice"], feed)

	// a repeated bookmark is ignored while an independent open is preserved
	await act(async () => {
		harness.read().handlers.openTopicFinding("finding-1")
		harness.read().handlers.bookmarkTopicFinding("finding-1", true)
		harness.read().handlers.bookmarkTopicFinding("finding-1", true)
	})
	await waitForHook(() => harness.read().pendingChanges.length === 2)
	expect(requests).toHaveLength(2)
	expect(applyTopicFeedChanges(feed, harness.read().pendingChanges)?.sections[0]?.topics[0]?.findings[0]).toMatchObject(
		{
			isConsumed: true,
			isBookmarked: true,
			viewCount: 4,
		},
	)

	// a rejected open restores only its fields after the bookmark succeeds
	await act(async () => bookmarkWrite.resolve(new Response(null, { status: 204 })))
	await waitForHook(() => harness.read().pendingChanges.length === 1)
	await act(async () => openedWrite.resolve(new Response("failed", { status: 500 })))
	await waitForHook(() => harness.read().pendingChanges.length === 0)
	expect(
		harness.client.getQueryData<TopicFeedResponse>(["topic-feed", "alice"])?.sections[0]?.topics[0]?.findings[0],
	).toMatchObject({ isConsumed: false, isBookmarked: true, viewCount: 3 })
})

test("an acknowledged write survives an older response that ignores query cancellation", async () => {
	// an earlier read stays unresolved while the write succeeds
	const staleRead = Promise.withResolvers<TopicFeedResponse>()
	const write = Promise.withResolvers<Response>()
	configureApiClient({ apiBaseUrl: "https://test.example", showError: () => undefined })
	globalThis.fetch = ((_input: RequestInfo | URL) => write.promise) as typeof fetch
	const harness = await renderTestHook(() =>
		useTopicFindingActions({ userId: "alice", shouldUpdateOptimistically: true }),
	)
	cleanups.push(harness.close)
	const queryKey = ["topic-feed", "alice"]
	const feed = toTestTopicFeedResponse()
	harness.client.setQueryData(queryKey, feed)
	const cancelledRead = harness.client.fetchQuery({ queryKey, queryFn: () => staleRead.promise }).catch(() => null)

	// cancellation happens before the confirmed fields enter the cache
	await act(async () => harness.read().handlers.bookmarkTopicFinding("finding-1", true))
	await act(async () => write.resolve(new Response(null, { status: 204 })))
	await waitForHook(() => harness.read().pendingChanges.length === 0)
	await cancelledRead
	expect(harness.client.getQueryState(queryKey)?.fetchStatus).toBe("idle")
	await act(async () => staleRead.resolve(feed))
	expect(
		harness.client.getQueryData<TopicFeedResponse>(queryKey)?.sections[0]?.topics[0]?.findings[0]?.isBookmarked,
	).toBe(true)
})
