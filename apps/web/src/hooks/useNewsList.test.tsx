// a news list's state: the window and the page, the cursor a later page passes back, opening and closing, and the two
// events with the list's place
import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import type { AnalyticsEventProperties } from "@carlnotes/contracts/analyticsEvents"
import { useNewsList } from "@carlnotes/core/hooks/useNewsList"
import { toNewsStoryPage } from "@carlnotes/core/lib/newsStories"
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

// a list over a stubbed api that returns the story's page a request names, with the urls it read and the events sent
async function renderNewsList(profileUserId: string | null): Promise<{
	harness: Awaited<ReturnType<typeof renderTestHook<ReturnType<typeof useNewsList>>>>
	requestUrls: string[]
	events: [string, AnalyticsEventProperties][]
}> {
	const requestUrls: string[] = []
	const events: [string, AnalyticsEventProperties][] = []
	configureApiClient({ apiBaseUrl: "https://test.example", showError: () => undefined })
	globalThis.fetch = ((input: RequestInfo | URL) => {
		requestUrls.push(String(input))
		const pageNumber = Number(new URL(String(input)).searchParams.get("page"))
		return Promise.resolve(Response.json(toNewsStoryPage(pageNumber)))
	}) as typeof fetch

	// the list as a signed-in user reads it
	const harness = await renderTestHook(() =>
		useNewsList({
			profileUserId,
			userId: "user-evan",
			captureVisitEvent: (event, properties) => events.push([event, properties]),
		}),
	)
	cleanups.push(harness.close)
	await waitForHook(() => harness.read().newsPage !== undefined)
	return { harness, requestUrls, events }
}

test("the home's list starts at the week's first page, and another page passes the window's cursor back", async () => {
	const { harness, requestUrls, events } = await renderNewsList(null)
	expect(harness.read()).toMatchObject({ window: "week", pageNumber: 1, pageCount: 7, isExpanded: true })
	expect(requestUrls).toEqual(["https://test.example/api/news?window=week&page=1"])

	// the third page reads with the cursor the first page returned, and reports the page
	await act(async () => harness.read().openPage(3))
	await waitForHook(() => harness.read().newsPage?.newsEvents[0]?.id === "story-row-10")
	expect(requestUrls.at(-1)).toBe("https://test.example/api/news?window=week&page=3&cursor=story-cursor")
	expect(events).toEqual([["social_news_page_open", { place: "home", page: 3 }]])
})

test("a profile's list reports its window change with the window, the place, and the profile's user id", async () => {
	const { harness, requestUrls, events } = await renderNewsList("user-roastfan")
	await act(async () => harness.read().openPage(2))
	await act(async () => harness.read().selectWindow("day"))
	await waitForHook(() => requestUrls.some((requestUrl) => requestUrl.includes("window=day")))

	// the chosen window starts at its first page with no cursor of the week's, and reads the profile's news
	expect(harness.read()).toMatchObject({ window: "day", pageNumber: 1 })
	expect(requestUrls.at(-1)).toBe("https://test.example/api/profiles/user-roastfan/news?window=day&page=1")
	expect(events).toEqual([
		["social_news_page_open", { place: "profile", profileUserId: "user-roastfan", page: 2 }],
		["social_news_window_change", { place: "profile", profileUserId: "user-roastfan", window: "day" }],
	])
})

test("the heading closes and opens the list, and choosing a window opens a closed one", async () => {
	const { harness, events } = await renderNewsList(null)
	await act(async () => harness.read().toggle())
	expect(harness.read().isExpanded).toBe(false)

	// a window chosen while the list is closed opens it, and a second press of the heading closes it again
	await act(async () => harness.read().selectWindow("hour"))
	expect(harness.read()).toMatchObject({ isExpanded: true, window: "hour" })
	await act(async () => harness.read().toggle())
	expect(harness.read().isExpanded).toBe(false)
	expect(events.map(([event]) => event)).toEqual(["social_news_window_change"])
})

test("no event holds text", async () => {
	const { harness, events } = await renderNewsList("user-roastfan")
	await act(async () => harness.read().openPage(2))
	await act(async () => harness.read().selectWindow("hour"))
	const propertyNames = events.flatMap(([, properties]) => Object.keys(properties))
	expect(new Set(propertyNames)).toEqual(new Set(["place", "profileUserId", "window", "page"]))
})
