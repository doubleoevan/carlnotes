import { expect, test } from "bun:test"
import { resourceKinds } from "@carlnotes/contracts/enums"
import {
	toTestTopicFeed,
	toTestTopicFeedResponse,
	toTestTopicFinding,
	toTestTopicResponse,
} from "@carlnotes/contracts/topicFeedTestFixtures"
import { filterTopicFeed, matchesTagFilters, selectTopicFindings, toggleTopicResourceKind } from "./topicFeed"
import { applyTopicFeedChanges, applyTopicPageChanges } from "./topicFindingChanges"

// complete findings exercise selection without a component or platform import
test("views exclude thumbs down, unread keeps bookmarks independent, and only own bookmarks pin", () => {
	const findings = [
		toTestTopicFinding({ findingId: "unread" }),
		toTestTopicFinding({ findingId: "read", isConsumed: true }),
		toTestTopicFinding({ findingId: "saved", isConsumed: true, isBookmarked: true }),
		toTestTopicFinding({ findingId: "down", rating: "down", isBookmarked: true }),
	]
	const selection = { findings, resourceKinds: new Set(resourceKinds), sort: "relevant" as const }
	expect(selectTopicFindings({ ...selection, findingFilter: "all" }).map((finding) => finding.findingId)).toEqual([
		"saved",
		"read",
		"unread",
	])
	expect(selectTopicFindings({ ...selection, findingFilter: "unread" }).map((finding) => finding.findingId)).toEqual([
		"unread",
	])
	expect(
		selectTopicFindings({ ...selection, findingFilter: "bookmarked" }).map((finding) => finding.findingId),
	).toEqual(["saved"])
})

test("tag modes, kind reset, and Featured order preserve the web selection", () => {
	// each match mode uses the same selected tags
	const tags = { topicTags: ["coffee"], tagFilters: ["coffee", "tea"] }
	expect(matchesTagFilters({ ...tags, tagMatchMode: "any" })).toBe(true)
	expect(matchesTagFilters({ ...tags, tagMatchMode: "all" })).toBe(false)
	expect(matchesTagFilters({ ...tags, tagMatchMode: "none" })).toBe(false)
	expect(matchesTagFilters({ ...tags, tagMatchMode: "off" })).toBe(true)
	expect(toggleTopicResourceKind({ resourceKinds: new Set(["read"]), resourceKind: "read" })).toEqual(
		new Set(resourceKinds),
	)

	// the Featured sequence stays editorial under Trending
	const feed = toTestTopicFeedResponse([])
	const featuredTopics = [
		toTestTopicFeed({ id: "first", viewerCount: 1 }),
		toTestTopicFeed({ id: "second", viewerCount: 100 }),
	]
	feed.sections = feed.sections.map((section) =>
		section.key === "featured" ? { ...section, topics: featuredTopics } : section,
	)
	const selected = filterTopicFeed({
		topicFeed: feed,
		resourceKinds: new Set(resourceKinds),
		findingFilter: "all",
		sort: "trending",
		tagFilters: [],
		tagMatchMode: "any",
	})
	expect(selected?.sections[2]?.topics.map((topic) => topic.id)).toEqual(["first", "second"])
})

test("the same actions update Home and Topic without changing their source payloads", () => {
	// combine opening and bookmarking one finding while updating another independently
	const findings = [toTestTopicFinding(), toTestTopicFinding({ findingId: "second" })]
	const feed = toTestTopicFeedResponse([toTestTopicFeed({ findings, newCount: 2 })])
	const page = { status: "visible" as const, topic: toTestTopicResponse({ findings, newCount: 2 }) }
	const changes = [
		{ kind: "opened" as const, findingId: "finding-1" },
		{ kind: "bookmark" as const, findingId: "finding-1", isBookmarked: true },
		{ kind: "opened" as const, findingId: "second" },
	]
	const changedFeed = applyTopicFeedChanges(feed, changes)
	const changedPage = applyTopicPageChanges(page, changes)
	expect(changedFeed?.sections[0]?.topics[0]?.findings[0]).toMatchObject({
		isBookmarked: true,
		isConsumed: true,
		viewCount: 4,
	})
	expect(changedPage?.status === "visible" && changedPage.topic.findings[1]).toMatchObject({
		isConsumed: true,
		viewCount: 4,
	})
	expect(changedPage?.status === "visible" && changedPage.topic.newCount).toBe(0)
	expect(feed.sections[0]?.topics[0]?.findings[0]?.isBookmarked).toBe(false)
	expect(applyTopicPageChanges({ status: "missing" }, changes)).toEqual({ status: "missing" })
})

test("Team bookmarks widen selection and every sort keeps own bookmarks pinned", () => {
	// a teammate's bookmark qualifies for the Team view without pinning above the user's own bookmark
	const teamBookmarks = [{ userId: "teammate", username: "coffee", avatarSource: null, avatarVersion: null }]
	const findings = [
		toTestTopicFinding({
			findingId: "own",
			isBookmarked: true,
			relevanceScore: 0.1,
			viewCount: 0,
			publishedAt: "2025-01-01",
		}),
		toTestTopicFinding({ findingId: "team", teamBookmarks, relevanceScore: 1, viewCount: 10 }),
		toTestTopicFinding({ findingId: "other" }),
	]
	for (const sort of ["relevant", "newest", "trending"] as const) {
		const selection = { findings, resourceKinds: new Set(resourceKinds), findingFilter: "bookmarked" as const, sort }
		expect(selectTopicFindings({ ...selection, bookmarkScope: "mine" }).map((finding) => finding.findingId)).toEqual([
			"own",
		])
		expect(selectTopicFindings({ ...selection, bookmarkScope: "team" }).map((finding) => finding.findingId)).toEqual([
			"own",
			"team",
		])
	}
})

test("sorts retain recency fallback and stable ties, and Resource-kind selection narrows findings", () => {
	// relevance and Trending break complete ties by id, while Newest keeps the input order
	const findings = [
		toTestTopicFinding({ findingId: "b" }),
		toTestTopicFinding({ findingId: "a" }),
		toTestTopicFinding({ findingId: "older", publishedAt: null, fetchedAt: "2025-01-01", resourceKind: "watch" }),
	]
	const selection = { findings, resourceKinds: new Set(resourceKinds), findingFilter: "all" as const }
	expect(selectTopicFindings({ ...selection, sort: "relevant" }).map((finding) => finding.findingId)).toEqual([
		"a",
		"b",
		"older",
	])
	expect(selectTopicFindings({ ...selection, sort: "trending" }).map((finding) => finding.findingId)).toEqual([
		"a",
		"b",
		"older",
	])
	expect(selectTopicFindings({ ...selection, sort: "newest" }).map((finding) => finding.findingId)).toEqual([
		"b",
		"a",
		"older",
	])
	expect(
		selectTopicFindings({ ...selection, resourceKinds: new Set(["watch"]), sort: "newest" }).map(
			(finding) => finding.findingId,
		),
	).toEqual(["older"])
})
