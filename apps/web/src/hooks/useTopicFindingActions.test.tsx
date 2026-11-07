import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import type { ReactionSummary } from "@carlnotes/contracts/social"
import { toTestTopicFeedResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { TopicFeedResponse } from "@carlnotes/contracts/topics"
import { usePageTopicFeedHandlers, useTopicFindingActions } from "@carlnotes/core/hooks/useTopicFindingActions"
import { applyTopicFeedChanges, type TopicFindingChange } from "@carlnotes/core/lib/topicFindingChanges"
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

// the summary a reaction's save returned
const SAVED_REACTIONS: ReactionSummary = {
	counts: [{ reactionType: "like", count: 1, users: [] }],
	ownReactionType: "like",
}

test("a saved reaction reaches the cached finding and its sheet with no request", async () => {
	// count every request, and record the confirmed change the mobile sheet keeps
	const requests: string[] = []
	const confirmedChanges: TopicFindingChange[] = []
	configureApiClient({ apiBaseUrl: "https://test.example", showError: () => undefined })
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		requests.push(String(input))
		return new Response(null, { status: 204 })
	}) as typeof fetch
	const harness = await renderTestHook(() =>
		useTopicFindingActions({
			userId: "alice",
			shouldUpdateOptimistically: true,
			onChangeConfirmed: (change) => confirmedChanges.push(change),
		}),
	)
	cleanups.push(harness.close)
	const queryKey = ["topic-feed", "alice"]
	harness.client.setQueryData(queryKey, toTestTopicFeedResponse())

	// the summary lands in the cache, so a reopened Finding shows the user's own reaction
	await act(async () => harness.read().handlers.keepTopicFindingReactions("finding-1", SAVED_REACTIONS))
	expect(
		harness.client.getQueryData<TopicFeedResponse>(queryKey)?.sections[0]?.topics[0]?.findings[0]?.reactions,
	).toEqual(SAVED_REACTIONS)
	expect(confirmedChanges).toEqual([{ kind: "reactions", findingId: "finding-1", reactions: SAVED_REACTIONS }])
	expect(requests).toEqual([])
})

test("page handlers keep a saved reaction on the page with no write or reload", async () => {
	// count every request and reload, and record the page's change
	const requests: string[] = []
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		requests.push(String(input))
		return new Response(null, { status: 204 })
	}) as typeof fetch
	const changes: TopicFindingChange[] = []
	let reloadCount = 0
	const reloadPage = (): void => {
		reloadCount += 1
	}
	const keepChange = (change: TopicFindingChange): void => {
		changes.push(change)
	}
	const page = await renderTestHook(() => usePageTopicFeedHandlers(reloadPage, keepChange))
	cleanups.push(page.close)
	await act(async () => page.read().keepTopicFindingReactions("finding-1", SAVED_REACTIONS))
	expect(changes).toEqual([{ kind: "reactions", findingId: "finding-1", reactions: SAVED_REACTIONS }])
	expect(reloadCount).toBe(0)
	expect(requests).toEqual([])
})
