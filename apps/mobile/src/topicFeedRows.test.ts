import { expect, test } from "bun:test"
import {
	toTestTopicFeed,
	toTestTopicFeedResponse,
	toTestTopicFinding,
} from "@carlnotes/contracts/topicFeedTestFixtures"
import { toInitialTopicSection, toTopicFeedRows, toTopicFindingRows } from "./topicFeedRows"

test("visitors open Featured and receive no account-owned feed sections", () => {
	// use the API's public section shape rather than an empty signed-in feed
	const feed = toTestTopicFeedResponse([])
	feed.sections = [
		{ key: "featured", topics: [toTestTopicFeed({ isTopicOwner: false, isTeamMember: false, canRate: false })] },
		{ key: "popular", topics: [] },
	]
	const rows = toTopicFeedRows({ topicFeed: feed, openSection: toInitialTopicSection(feed) })
	expect(toInitialTopicSection(feed)).toBe("featured")
	expect(rows.filter((row) => row.kind === "section").map((row) => row.sectionKey)).toEqual(["featured", "popular"])
	expect(rows.some((row) => row.kind === "topic")).toBe(true)
})

test("Home opens followed topics only when the user owns none", () => {
	// own topics take precedence, then followed topics, then an empty Yours
	const feed = toTestTopicFeedResponse([])
	feed.sections = feed.sections.map((section) =>
		section.key === "subscribed" ? { ...section, topics: [toTestTopicFeed()] } : section,
	)
	expect(toInitialTopicSection(feed)).toBe("subscribed")
	feed.sections = feed.sections.map((section) =>
		section.key === "yours" ? { ...section, topics: [toTestTopicFeed()] } : section,
	)
	expect(toInitialTopicSection(feed)).toBe("yours")
	expect(toInitialTopicSection(toTestTopicFeedResponse([]))).toBe("yours")
})

test("one expanded section has five findings per Topic and an in-place expander", () => {
	// repeat the topic across sections to verify section-scoped keys
	const findings = Array.from({ length: 7 }, (_, i) => toTestTopicFinding({ findingId: `finding-${i}` }))
	const feed = toTestTopicFeedResponse([toTestTopicFeed({ findings })])
	feed.sections = feed.sections.map((section) =>
		section.key === "featured" ? { ...section, topics: [toTestTopicFeed({ findings })] } : section,
	)
	const ownRows = toTopicFeedRows({ topicFeed: feed, openSection: "yours" })
	const featuredRows = toTopicFeedRows({ topicFeed: feed, openSection: "featured" })
	expect(ownRows.filter((row) => row.kind === "section")).toHaveLength(4)
	expect(ownRows.filter((row) => row.kind === "findings")).toHaveLength(1)
	expect(ownRows.find((row) => row.kind === "findings")?.findingRows).toHaveLength(5)
	expect(ownRows.find((row) => row.kind === "more")).toMatchObject({
		findingCount: 2,
		topicKey: "yours:topic-1",
		isExpanded: false,
	})
	expect(ownRows.find((row) => row.kind === "findings")?.key).not.toBe(
		featuredRows.find((row) => row.kind === "findings")?.key,
	)
	expect(new Set(ownRows.map((row) => row.key)).size).toBe(ownRows.length)

	// expansion reveals every finding without changing their keys or another section's preview
	const expandedTopicKeys = new Set(["yours:topic-1"])
	const expandedRows = toTopicFeedRows({ topicFeed: feed, openSection: "yours", expandedTopicKeys })
	expect(expandedRows.find((row) => row.kind === "findings")?.findingRows).toHaveLength(7)
	expect(expandedRows.find((row) => row.kind === "more")).toMatchObject({ isExpanded: true })
	expect(expandedRows.find((row) => row.kind === "findings")?.key).toBe(
		ownRows.find((row) => row.kind === "findings")?.key,
	)
	expect(
		toTopicFeedRows({ topicFeed: feed, openSection: "featured", expandedTopicKeys }).find(
			(row) => row.kind === "findings",
		)?.findingRows,
	).toHaveLength(5)

	// collapsing restores the original five rows and removes the final separator
	expandedTopicKeys.delete("yours:topic-1")
	expect(toTopicFeedRows({ topicFeed: feed, openSection: "yours", expandedTopicKeys })).toEqual(ownRows)
	expect(ownRows.find((row) => row.kind === "findings")?.findingRows.at(-1)).toMatchObject({ isLast: true })
})

test("empty and collapsed sections retain their heading and matching copy", () => {
	const feed = toTestTopicFeedResponse([])
	expect(toTopicFeedRows({ topicFeed: feed, openSection: null })).toHaveLength(4)
	expect(toTopicFeedRows({ topicFeed: feed, openSection: "yours" }).find((row) => row.kind === "empty")).toMatchObject({
		text: "Give Carl a topic. You know the one.",
	})
})

test("bookmarks keep their rank slot and filtered findings form one continuous card", () => {
	// pin a bookmark ahead of ordinary findings
	const findings = [
		toTestTopicFinding({ findingId: "saved", isBookmarked: true }),
		toTestTopicFinding({ findingId: "first" }),
		toTestTopicFinding({ findingId: "second" }),
	]
	const findingRows = toTopicFindingRows(findings)
	expect(findingRows.map((row) => row.topicFindingRank)).toEqual([null, 1, 2])
	expect(findingRows.map((row) => row.isLast)).toEqual([false, false, true])

	// a filtered single row has no separator and an empty list stays empty
	expect(toTopicFindingRows(findings.slice(1, 2))[0]).toMatchObject({
		topicFindingRank: 1,
		isLast: true,
	})
	expect(toTopicFindingRows([])).toEqual([])
})
