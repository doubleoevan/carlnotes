import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import type { SearchResultsPage } from "@carlnotes/contracts/search"
import {
	toTestTopicFeed,
	toTestTopicFeedResponse,
	toTestTopicFinding,
	toTestTopicResponse,
} from "@carlnotes/contracts/topicFeedTestFixtures"
import type { TopicFeedResponse } from "@carlnotes/contracts/topics"
import { useTopicFeedState } from "@carlnotes/core/hooks/useTopicFeedState"
import { usePageTopicFeedHandlers, useTopicFindingActions } from "@carlnotes/core/hooks/useTopicFindingActions"
import { applySearchFindingChanges, type TopicFindingChange } from "@carlnotes/core/lib/topicFindingChanges"
import { onlineManager } from "@tanstack/react-query"
import { act } from "react"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// release every environment even after a failed assertion
const originalFetch = globalThis.fetch
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	globalThis.fetch = originalFetch
	onlineManager.setOnline(true)
	configureApiClient({ apiBaseUrl: "", showError: console.error })
})

test("visitor hydration, defaults, resets, and account changes keep query identities separate", async () => {
	// visitor hydration prevents a redundant browser request
	const visitorFeed = toTestTopicFeedResponse()
	const accountRead = Promise.withResolvers<Response>()
	let readCount = 0
	stubRequests(async () => {
		readCount += 1
		return accountRead.promise
	})
	const harness = await renderTestHook(() => useTopicFeedState({ userId: null, visitorInitialData: visitorFeed }))
	cleanups.push(harness.close)
	expect(harness.read().topicFeed).toEqual(visitorFeed)
	expect(readCount).toBe(0)
	expect(harness.read()).toMatchObject({
		findingFilter: "all",
		sort: "relevant",
		bookmarkScope: "mine",
		tagFilters: [],
		tagMatchMode: "any",
		reheatKey: 0,
	})

	// navigation's reset restores every shared selection
	await act(async () => {
		harness.read().setFindingFilter("bookmarked")
		harness.read().setSort("newest")
		harness.read().setTagFilters(["tea"])
		harness.read().setBookmarkScope("team")
	})
	await act(async () => harness.read().resetFilters())
	expect(harness.read()).toMatchObject({
		findingFilter: "all",
		sort: "relevant",
		bookmarkScope: "mine",
		tagFilters: [],
	})

	// a signed-in query never borrows the visitor's payload while its read is pending
	await harness.render(() => useTopicFeedState({ userId: "alice", visitorInitialData: visitorFeed }))
	expect(harness.read().topicFeed).toBeNull()
	accountRead.resolve(Response.json(toTestTopicFeedResponse([toTestTopicFeed({ id: "alice-topic" })])))
	await waitForHook(() => harness.read().topicFeed !== null)
	expect(harness.read().topicFeed?.sections[0]?.topics[0]?.id).toBe("alice-topic")
})

test("reheat advances only after both reads succeed and stops immediately offline", async () => {
	// load a confirmed feed before testing background refreshes
	let shouldFail = false
	let requestCount = 0
	stubRequests(async () => {
		requestCount += 1
		if (shouldFail) {
			throw new Error("offline")
		}
		return Response.json(toTestTopicFeedResponse())
	})
	const harness = await renderTestHook(() => useTopicFeedState({ userId: "alice" }))
	cleanups.push(harness.close)
	await waitForHook(() => harness.read().topicFeed !== null)
	await act(async () => harness.read().reheat(async () => true))
	expect(harness.read().reheatKey).toBe(1)
	await act(async () => harness.read().reheat(async () => false))
	expect(harness.read().reheatKey).toBe(1)

	// a failed read keeps confirmed data and ends the spinner
	shouldFail = true
	await act(async () => harness.read().reheat())
	expect(harness.read().topicFeed).not.toBeNull()
	expect(harness.read().isReheating).toBe(false)
	expect(harness.read().reheatKey).toBe(1)
	onlineManager.setOnline(false)
	const offlineRequestCount = requestCount
	await act(async () => harness.read().reheat())
	expect(requestCount).toBe(offlineRequestCount)
})

test("optimistic overlap rolls back only its failed finding and saves an acknowledged write despite a failed reread", async () => {
	// hold two independent writes and fail their later reconciliation read
	const firstWrite = Promise.withResolvers<Response>()
	const secondWrite = Promise.withResolvers<Response>()
	const findings = [toTestTopicFinding(), toTestTopicFinding({ findingId: "second" })]
	const feed = toTestTopicFeedResponse([toTestTopicFeed({ findings, newCount: 2 })])
	let shouldFailRead = false
	let writeCount = 0
	stubRequests(async (url) => {
		if (url.includes("/topic-findings/")) {
			writeCount += 1
			return url.includes("/second/") ? secondWrite.promise : firstWrite.promise
		}
		if (shouldFailRead) {
			throw new Error("refresh failed")
		}
		return Response.json(feed)
	})
	const harness = await renderTestHook(() => useTopicFeedState({ userId: "alice", shouldUpdateOptimistically: true }))
	cleanups.push(harness.close)
	await waitForHook(() => harness.read().topicFeed !== null)
	harness.client.setQueryData(["topic-page", "alice", "topic-1"], {
		status: "visible",
		topic: toTestTopicResponse({ findings }),
	})

	// share the same findings across search pages while isolating another account's cache
	const searchPage: SearchResultsPage = {
		page: 1,
		pageSize: 10,
		pageCount: 1,
		rowCount: findings.length,
		podcastEpisodes: [],
		rows: findings.map((finding) => ({
			kind: "finding",
			id: finding.findingId,
			name: finding.title ?? "Finding",
			path: "/topics/topic-1",
			date: null,
			count: 0,
			finding,
			topic: {
				id: "topic-1",
				name: "Coffee",
				prompt: "Find coffee",
				visibility: "public",
				canRate: true,
				canBookmark: true,
			},
		})),
	}
	const searchData = { pages: [searchPage], pageParams: [1] }
	harness.client.setQueryData(["site-search", "alice", "coffee"], searchData)
	harness.client.setQueryData(["site-search", "bob", "coffee"], searchData)

	// repeat the first press synchronously to prove the per-finding guard
	await act(async () => {
		harness.read().handlers.bookmarkTopicFinding("finding-1", true)
		harness.read().handlers.bookmarkTopicFinding("finding-1", true)
		harness.read().handlers.consumeTopicFinding("second", true)
	})
	await waitForHook(() => harness.read().pendingChanges.length === 2)
	expect(writeCount).toBe(2)
	expect(applySearchFindingChanges(searchPage, harness.read().pendingChanges).rows).toMatchObject([
		{ finding: { isBookmarked: true } },
		{ finding: { isConsumed: true } },
	])
	expect(
		applySearchFindingChanges(searchPage, [
			{ kind: "opened", findingId: "finding-1" },
			...harness.read().pendingChanges,
		]).rows,
	).toMatchObject([
		{ finding: { isConsumed: true, isBookmarked: true, viewCount: 4 } },
		{ finding: { isConsumed: true } },
	])
	expect(harness.client.getQueryData(["site-search", "alice", "coffee"])).toEqual(searchData)
	expect(
		harness.client.getQueryData<TopicFeedResponse>(["topic-feed", "alice"])?.sections[0]?.topics[0]?.findings[0]
			?.isBookmarked,
	).toBe(false)
	expect(
		harness.read().topicFeed?.sections[0]?.topics[0]?.findings.find((finding) => finding.findingId === "finding-1")
			?.isBookmarked,
	).toBe(true)
	await act(async () => firstWrite.resolve(new Response("rejected", { status: 500 })))
	await waitForHook(() => harness.read().pendingChanges.length === 1)
	expect(applySearchFindingChanges(searchPage, harness.read().pendingChanges).rows).toMatchObject([
		{ finding: { isBookmarked: false } },
		{ finding: { isConsumed: true } },
	])
	expect(
		harness.read().topicFeed?.sections[0]?.topics[0]?.findings.find((finding) => finding.findingId === "finding-1")
			?.isBookmarked,
	).toBe(false)
	expect(
		harness.read().topicFeed?.sections[0]?.topics[0]?.findings.find((finding) => finding.findingId === "second")
			?.isConsumed,
	).toBe(true)

	// acknowledge only the second write and retain it after a rejected refresh
	shouldFailRead = true
	await act(async () => secondWrite.resolve(new Response(null, { status: 204 })))
	await waitForHook(() => harness.read().pendingChanges.length === 0 && harness.read().isError)
	expect(
		harness.client.getQueryData<TopicFeedResponse>(["topic-feed", "alice"])?.sections[0]?.topics[0]?.findings[1]
			?.isConsumed,
	).toBe(true)
	expect(harness.client.getQueryData(["topic-page", "alice", "topic-1"])).toMatchObject({
		topic: {
			findings: [
				{ findingId: "finding-1", isConsumed: false },
				{ findingId: "second", isConsumed: true },
			],
		},
	})
	// commit the successful finding to search without mutating its input or another account
	expect(harness.client.getQueryData(["site-search", "alice", "coffee"])).toMatchObject({
		pages: [{ rows: [{ finding: { isBookmarked: false } }, { finding: { isConsumed: true } }] }],
	})
	expect(harness.client.getQueryData(["site-search", "bob", "coffee"])).toEqual(searchData)
	expect(searchPage.rows).toMatchObject([{ finding: { isBookmarked: false } }, { finding: { isConsumed: false } }])
})

test("web actions wait for transport and page handlers reload without a router", async () => {
	// the default hook leaves its presented finding unchanged while transport waits
	const write = Promise.withResolvers<Response>()
	stubRequests(async (url) =>
		url.includes("/topic-findings/") ? write.promise : Response.json(toTestTopicFeedResponse()),
	)
	const harness = await renderTestHook(() => useTopicFeedState({ userId: "alice" }))
	cleanups.push(harness.close)
	await waitForHook(() => harness.read().topicFeed !== null)
	await act(async () => harness.read().handlers.bookmarkTopicFinding("finding-1", true))
	expect(harness.read().pendingChanges).toEqual([])
	expect(harness.read().topicFeed?.sections[0]?.topics[0]?.findings[0]?.isBookmarked).toBe(false)
	write.resolve(new Response(null, { status: 204 }))
	await waitForHook(() => harness.client.isMutating() === 0)
	await harness.close()
	cleanups.pop()

	// page actions await their request before invoking the supplied reload
	let reloadCount = 0
	const page = await renderTestHook(() =>
		usePageTopicFeedHandlers(() => {
			reloadCount += 1
		}),
	)
	cleanups.push(page.close)
	await act(async () => page.read().openTopicFinding("finding-1"))
	await waitForHook(() => reloadCount === 1)
})

test("a failed open restores its read state and offline writes never reach transport", async () => {
	// hold an open request while its tentative presentation is visible
	const write = Promise.withResolvers<Response>()
	let writeCount = 0
	stubRequests(async (url) => {
		if (url.includes("/topic-findings/")) {
			writeCount += 1
			return write.promise
		}
		return Response.json(toTestTopicFeedResponse())
	})
	const harness = await renderTestHook(() => useTopicFeedState({ userId: "alice", shouldUpdateOptimistically: true }))
	cleanups.push(harness.close)
	await waitForHook(() => harness.read().topicFeed !== null)
	await act(async () => harness.read().handlers.openTopicFinding("finding-1"))
	await waitForHook(() => harness.read().pendingChanges.length === 1)
	expect(harness.read().topicFeed?.sections[0]?.topics[0]?.findings[0]).toMatchObject({
		isConsumed: true,
		viewCount: 4,
	})
	await act(async () => write.resolve(new Response("failed", { status: 500 })))
	await waitForHook(() => harness.read().pendingChanges.length === 0)
	expect(harness.read().topicFeed?.sections[0]?.topics[0]?.findings[0]).toMatchObject({
		isConsumed: false,
		viewCount: 3,
	})

	// known-offline attempts settle as failed mutations without creating a request
	onlineManager.setOnline(false)
	await act(async () => harness.read().handlers.bookmarkTopicFinding("finding-1", true))
	await waitForHook(() => harness.client.isMutating() === 0)
	expect(writeCount).toBe(1)
	expect(
		harness.client
			.getMutationCache()
			.getAll()
			.every((mutation) => !mutation.state.isPaused),
	).toBe(true)
	expect(harness.read().topicFeed?.sections[0]?.topics[0]?.findings[0]?.isBookmarked).toBe(false)
})

test("clearing a rating and removing a down-rated finding are optimistic and independently reversible", async () => {
	// keep the confirmed rating in query data until a request succeeds
	let write = Promise.withResolvers<Response>()
	stubRequests(async (url) =>
		url.includes("/topic-findings/")
			? write.promise
			: Response.json(toTestTopicFeedResponse([toTestTopicFeed({ findings: [toTestTopicFinding({ rating: "up" })] })])),
	)
	const harness = await renderTestHook(() => useTopicFeedState({ userId: "alice", shouldUpdateOptimistically: true }))
	cleanups.push(harness.close)
	await waitForHook(() => harness.read().topicFeed !== null)
	await act(async () => harness.read().handlers.rateTopicFinding("finding-1", null))
	await waitForHook(() => harness.read().pendingChanges.length === 1)
	expect(harness.read().topicFeed?.sections[0]?.topics[0]?.findings[0]?.rating).toBeNull()
	await act(async () => write.resolve(new Response("failed", { status: 500 })))
	await waitForHook(() => harness.read().pendingChanges.length === 0)
	expect(harness.read().topicFeed?.sections[0]?.topics[0]?.findings[0]?.rating).toBe("up")

	// thumbs down removes the row before the response, then restores it on failure
	write = Promise.withResolvers<Response>()
	await act(async () => harness.read().handlers.rateTopicFinding("finding-1", "down"))
	await waitForHook(() => harness.read().topicFeed?.sections[0]?.topics[0]?.findings.length === 0)
	await act(async () => write.resolve(new Response("failed", { status: 500 })))
	await waitForHook(() => harness.read().pendingChanges.length === 0)
	expect(harness.read().topicFeed?.sections[0]?.topics[0]?.findings).toHaveLength(1)
})

test("finding detail owners receive only acknowledged changes, after the shared cache is updated", async () => {
	// retain details outside the filtered feed while delaying each write
	let write = Promise.withResolvers<Response>()
	const confirmedChanges: TopicFindingChange[] = []
	stubRequests(async () => write.promise)
	const harness = await renderTestHook(() =>
		useTopicFindingActions({
			userId: "alice",
			shouldUpdateOptimistically: true,
			onChangeConfirmed: (change) => confirmedChanges.push(change),
		}),
	)
	cleanups.push(harness.close)
	harness.client.setQueryData(["topic-feed", "alice"], toTestTopicFeedResponse())

	// a rejected rating never becomes the retained detail state
	await act(async () => harness.read().handlers.rateTopicFinding("finding-1", "down"))
	await waitForHook(() => harness.read().pendingChanges.length === 1)
	expect(confirmedChanges).toEqual([])
	await act(async () => write.resolve(new Response("failed", { status: 500 })))
	await waitForHook(() => harness.read().pendingChanges.length === 0)
	expect(confirmedChanges).toEqual([])

	// an acknowledged rating reaches both the retained details and the shared feed
	write = Promise.withResolvers<Response>()
	await act(async () => harness.read().handlers.rateTopicFinding("finding-1", "down"))
	await act(async () => write.resolve(Response.json({ ok: true })))
	await waitForHook(() => confirmedChanges.length === 1 && harness.read().pendingChanges.length === 0)
	expect(confirmedChanges).toEqual([{ kind: "rating", findingId: "finding-1", rating: "down" }])
	expect(
		harness.client.getQueryData<TopicFeedResponse>(["topic-feed", "alice"])?.sections[0]?.topics[0]?.findings[0]
			?.rating,
	).toBe("down")
})

// replace transport without mocking React or the shared state module
function stubRequests(request: (url: string) => Promise<Response>): void {
	configureApiClient({ apiBaseUrl: "https://test.example", showError: () => undefined })
	globalThis.fetch = ((input: RequestInfo | URL) => request(String(input))) as typeof fetch
}
