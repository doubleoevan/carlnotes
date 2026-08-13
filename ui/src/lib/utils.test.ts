// tests for utils methods and dependencies

import { afterEach, expect, setSystemTime, test } from "bun:test"
import type { TopicFinding } from "@shared/contracts"
import { toScanRecapPlaceholder } from "@/components/topic/TopicScanRecap"
import {
	cn,
	durationMsBetween,
	matchesFeedView,
	toAgeLabel,
	toDurationLabel,
	toPossibleSourceUrls,
	toSafeRedirectPath,
	toScheduleLabel,
	toSortedFindings,
	toTimeLabel,
} from "./utils"

// twMerge makes later tailwind classes win over earlier conflicting ones
test("cn merges conflicting tailwind classes", () => {
	expect(cn("p-2", "p-4")).toBe("p-4")
})

// clsx drops falsy conditional values and keeps truthy ones
test("cn handles conditional class values", () => {
	expect(cn("base", false && "hidden", true && "block")).toBe("base block")
})

// the age label tests need to freeze the clock so that buckets are deterministic. reset to real time after each test
afterEach(() => setSystemTime())

test("toAgeLabel buckets elapsed time into the coarsest unit", () => {
	setSystemTime(new Date("2026-07-17T12:00:00.000Z"))
	const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString()
	// null and same-day
	expect(toAgeLabel(null)).toBe("")
	expect(toAgeLabel(daysAgo(0))).toBe("today")
	// days and weeks
	expect(toAgeLabel(daysAgo(6))).toBe("6d")
	expect(toAgeLabel(daysAgo(7))).toBe("1w")
	expect(toAgeLabel(daysAgo(29))).toBe("4w")
	// months and years, including the boundaries
	expect(toAgeLabel(daysAgo(30))).toBe("1mo")
	expect(toAgeLabel(daysAgo(364))).toBe("12mo")
	expect(toAgeLabel(daysAgo(365))).toBe("1y")
	expect(toAgeLabel(daysAgo(900))).toBe("2y")
})

test("durationMsBetween measures the span, or reads null while unfinished", () => {
	expect(durationMsBetween("2026-07-21T00:00:00.000Z", "2026-07-21T00:02:00.000Z")).toBe(120_000)
	expect(durationMsBetween("2026-07-21T00:00:00.000Z", null)).toBeNull()
})

test("toDurationLabel reads seconds under a minute and minutes above", () => {
	// null and negative spans render as nothing
	expect(toDurationLabel(null)).toBe("")
	expect(toDurationLabel(-1000)).toBe("")
	// whole seconds under a minute
	expect(toDurationLabel(45_000)).toBe("45s")
	// whole minutes drop the trailing decimal, fractional minutes keep one
	expect(toDurationLabel(180_000)).toBe("3 min")
	expect(toDurationLabel(264_000)).toBe("4.4 min")
})

test("toTimeLabel leaves the hour unpadded and crosses noon and midnight", () => {
	expect(toTimeLabel("09:00")).toBe("9:00 AM")
	expect(toTimeLabel("00:00")).toBe("12:00 AM")
	expect(toTimeLabel("12:00")).toBe("12:00 PM")
	expect(toTimeLabel("23:30")).toBe("11:30 PM")
})

test("toScheduleLabel names the day only for weekly", () => {
	expect(toScheduleLabel("daily", "09:00", "monday")).toBe("Daily at 9:00 AM")
	expect(toScheduleLabel("weekdays", "09:00", "monday")).toBe("Weekdays at 9:00 AM")
	expect(toScheduleLabel("weekly", "09:00", "friday")).toBe("Weekly on Friday at 9:00 AM")
})

// a topic finding fixture for the view and sort helpers. overrides set the fields that a test case exercises
function topicFinding(overrides: Partial<TopicFinding>): TopicFinding {
	return {
		// identity and resource metadata. publishedAt and fetchedAt are what the recency sorts read
		findingId: "f",
		scanId: "s",
		resourceId: "r",
		url: "https://example.com/a",
		resourceKind: "read",
		title: null,
		source: null,
		publishedAt: null,
		fetchedAt: "2026-07-01T00:00:00.000Z",
		// the judgment, signals, and per-user states the helpers read
		viewCount: 0,
		relevanceScore: 0,
		relevanceExplanation: "",
		rating: null,
		engagement: null,
		isConsumed: false,
		isBookmarked: false,
		...overrides,
	}
}

// each view keeps its own slice: all keeps everything, unread drops consumed, bookmarked keeps bookmarks only
test("matchesFeedView filters by the active view", () => {
	const consumed = topicFinding({ isConsumed: true })
	const bookmarked = topicFinding({ isBookmarked: true })
	expect(matchesFeedView(consumed, "all")).toBe(true)
	expect(matchesFeedView(consumed, "unread")).toBe(false)
	expect(matchesFeedView(consumed, "bookmarked")).toBe(false)
	expect(matchesFeedView(bookmarked, "bookmarked")).toBe(true)
})

// bookmarked findings pin first in every mode, and each group orders internally by the active sort
test("toSortedFindings pins bookmarks and sorts each group", () => {
	const pinnedLow = topicFinding({ findingId: "pinned-low", relevanceScore: 0.1, isBookmarked: true })
	const keptHigh = topicFinding({ findingId: "kept-high", relevanceScore: 0.9 })
	const keptLow = topicFinding({ findingId: "kept-low", relevanceScore: 0.5 })
	// the pinned row leads despite its lower relevance, and the unbookmarked group sorts among itself
	const relevantOrder = toSortedFindings([keptLow, keptHigh, pinnedLow], "relevant")
	expect(relevantOrder.map((finding) => finding.findingId)).toEqual(["pinned-low", "kept-high", "kept-low"])
})

// the homepage and the topic page build a topic's list from separately queried rows, so ties have to
// settle the same way on both no matter what order the rows arrived in
test("toSortedFindings breaks relevance ties the same way no matter what the incoming order", () => {
	const tiedFindings = [
		topicFinding({ findingId: "b", relevanceScore: 1, publishedAt: "2026-07-01T00:00:00.000Z" }),
		topicFinding({ findingId: "a", relevanceScore: 1, publishedAt: "2026-07-01T00:00:00.000Z" }),
		topicFinding({ findingId: "c", relevanceScore: 1, publishedAt: "2026-07-20T00:00:00.000Z" }),
	]
	// the newest of the tied findings leads, and the two sharing a date settle by id instead of by arrival
	const relevantIds = toSortedFindings(tiedFindings, "relevant").map((finding) => finding.findingId)
	expect(relevantIds).toEqual(["c", "a", "b"])
	const reversedIds = toSortedFindings([...tiedFindings].reverse(), "relevant").map((finding) => finding.findingId)
	expect(reversedIds).toEqual(relevantIds)
})

// trending ranks sort by engagement value first, and value-less findings fall back to recency
test("toSortedFindings trending falls back to newest without an engagement value", () => {
	const hot = topicFinding({ findingId: "hot", engagement: 500, publishedAt: "2026-07-01T00:00:00.000Z" })
	const mild = topicFinding({ findingId: "mild", engagement: 20, publishedAt: "2026-07-10T00:00:00.000Z" })
	const newer = topicFinding({ findingId: "newer", publishedAt: "2026-07-20T00:00:00.000Z" })
	const older = topicFinding({ findingId: "older", publishedAt: "2026-07-05T00:00:00.000Z" })
	// engagement values rank first by size, then the value-less order by recency
	const trendingOrder = toSortedFindings([older, newer, mild, hot], "trending")
	expect(trendingOrder.map((finding) => finding.findingId)).toEqual(["hot", "mild", "newer", "older"])
})

// the recap placeholder shows still-reading only while the scan runs, or a call to action for the budget wall
test("toScanRecapPlaceholder matches the scan outcome", () => {
	expect(toScanRecapPlaceholder({ status: "running", error: null })).toBe(
		"I'm on my fifteenth mug.\nThe internet was busy today…",
	)
	expect(toScanRecapPlaceholder({ status: "failed", error: "Budget has been exceeded!" })).toBe(
		"Today I ran out of coffee.",
	)
	expect(toScanRecapPlaceholder({ status: "failed", error: "connection rejected" })).toBe("This one didn't brew.")

	// a succeeded scan whose report call threw an error still has its findings, so it must not show still-reading
	expect(toScanRecapPlaceholder({ status: "succeeded", error: null })).toBe(
		"No entry for this one.\nThe raccoon stole my keyboard.\nFindings are all there though.",
	)
})

// a url written plainly in the prompt is offered as a Source
test("a url in the prompt is offered", () => {
	expect(toPossibleSourceUrls("read https://example.com/post", [], [])).toEqual(["https://example.com/post"])
})

// the sentence's own punctuation is not part of the address
test("trailing sentence punctuation is not part of the url", () => {
	expect(toPossibleSourceUrls("read https://example.com/post.", [], [])).toEqual(["https://example.com/post"])
	expect(toPossibleSourceUrls("read https://example.com/post, then rest", [], [])).toEqual(["https://example.com/post"])
})

// a bracket the url opened belongs to it, and one the sentence opened does not
test("brackets settle by whether the url opened them", () => {
	expect(toPossibleSourceUrls("see https://en.wikipedia.org/wiki/Ruby_(gem)", [], [])).toEqual([
		"https://en.wikipedia.org/wiki/Ruby_(gem)",
	])
	expect(toPossibleSourceUrls("(see https://example.com/post)", [], [])).toEqual(["https://example.com/post"])
})

// a pasted address may carry an upper-case scheme
test("an upper-case scheme still matches", () => {
	expect(toPossibleSourceUrls("read HTTPS://example.com/post", [], [])).toEqual(["HTTPS://example.com/post"])
})

// a url that is already a Source has nothing to offer
test("a url that is already a source is not offered", () => {
	const keptSources = [{ sourceKind: "url", config: { url: "https://example.com/post" } }]
	expect(toPossibleSourceUrls("read https://example.com/post", keptSources, [])).toEqual([])
	const addedSources = [{ sourceKind: "url", value: "https://example.com/post" }]
	expect(toPossibleSourceUrls("read https://example.com/post", [], addedSources)).toEqual([])
})

// the same url written twice is offered once
test("a repeated url is offered once", () => {
	expect(toPossibleSourceUrls("https://example.com/a and https://example.com/a", [], [])).toEqual([
		"https://example.com/a",
	])
})

// a redirect path stays on this site: absolute urls, protocol-relative, backslash, and control tricks all fall home
test("toSafeRedirectPath keeps a plain path and rejects everything that could leave the site", () => {
	expect(toSafeRedirectPath("/topics/top_longevity")).toBe("/topics/top_longevity")
	expect(toSafeRedirectPath(null)).toBe("/")
	expect(toSafeRedirectPath("https://evil.com")).toBe("/")
	expect(toSafeRedirectPath("//evil.com")).toBe("/")
	expect(toSafeRedirectPath("/\\evil.com")).toBe("/")
	expect(toSafeRedirectPath("\\/evil.com")).toBe("/")
	expect(toSafeRedirectPath("/\tevil.com")).toBe("/")
})
