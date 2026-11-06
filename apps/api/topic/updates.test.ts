// the updates list: the ranking and its recency boost, the reading budget, the page budget, the visibility of the
// read, and the consumptions that move the next list on
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import type { topics } from "@carlnotes/db/schema/topics"
import * as analytics from "@carlnotes/server/analytics"
import { TEST_ANALYTICS_PROPERTIES } from "../analyticsTestFixtures"
import { MCP_PAGE_MAX_CHARS } from "../mcp/results"
import { toFencedUpdates } from "../mcp/updatesTool"
import * as accessibleFindings from "./accessibleFindings"
import { type BuiltUpdates, buildUpdates, rankFindingRows, trimToReadingBudget } from "./updates"
import * as updatesOpener from "./updatesOpener"

// the times around the user's last read time
const LAST_CONSUMED_AT = new Date("2026-11-01T12:00:00Z")
const BEFORE_LAST_CONSUMED_AT = new Date("2026-10-30T12:00:00Z")
const AFTER_LAST_CONSUMED_AT = new Date("2026-11-02T12:00:00Z")

// the user asking, and what every list passes
const USER_ID = "user-1"
const UPDATES_OPTIONS = {
	userId: USER_ID,
	minutes: 15,
	topicId: null,
	analyticsProperties: TEST_ANALYTICS_PROPERTIES,
} as const

// how the read of a list's Topics starts
const TOPICS_READ_PREFIX = 'select "id", "name", "prompt"'

// the fields of an unread Finding that a test sets
type UnreadFinding = {
	findingId: string
	relevanceScore?: number
	createdAt?: Date
	contentBytes?: number | null
	relevanceExplanation?: string
}

// a row the ranking and the reading budget read
type RankedRow = {
	findingId: string
	relevanceScore: number
	findingCreatedAt: Date
	resourceKind: "read"
	contentBytes: null
	durationSeconds: null
}

// the stubbed store's sent queries, and the Finding ids it has marked read
type FindingStore = { sentQueries: SentQuery[]; consumedFindingIds: Set<string> }

// a ranked row with no length, so each row counts the read estimate of five minutes
function toRankedRow(findingId: string, relevanceScore: number, findingCreatedAt: Date): RankedRow {
	return {
		findingId,
		relevanceScore,
		findingCreatedAt,
		resourceKind: "read",
		contentBytes: null,
		durationSeconds: null,
	}
}

// one row of the unread read, in its select order
function toUnreadRow(unreadFinding: UnreadFinding, unreadCount: number): unknown[] {
	const createdAt = unreadFinding.createdAt ?? BEFORE_LAST_CONSUMED_AT
	return [
		// the finding, its scan, and its resource
		unreadFinding.findingId,
		"scan-1",
		`resource-${unreadFinding.findingId}`,
		`https://example.com/${unreadFinding.findingId}`,
		"read",
		`Title ${unreadFinding.findingId}`,
		createdAt,
		createdAt,
		// the review
		unreadFinding.relevanceScore ?? 0.8,
		unreadFinding.relevanceExplanation ?? "Worth reading.",
		0,
		null,
		// its Topic, its length, its arrival, and the user's own columns
		"topic-1",
		"Espresso",
		unreadFinding.contentBytes ?? null,
		null,
		createdAt,
		null,
		null,
		unreadCount,
	]
}

// the unread Findings that the store returns, and the Finding ids it has marked read
function stubFindingStore(
	unreadFindings: UnreadFinding[],
	lastConsumedAt: Date | null = LAST_CONSUMED_AT,
): FindingStore {
	const consumedFindingIds = new Set<string>()
	const sentQueries = stubConnectionPool(({ text, values }) => {
		// the read leaves out what is already marked read, and counts what is left
		if (text.includes("count(*) over ()")) {
			const unreadRows = unreadFindings.filter(({ findingId }) => !consumedFindingIds.has(findingId))
			return unreadRows.map((unreadFinding) => toUnreadRow(unreadFinding, unreadRows.length))
		}
		// the last read time query returns a fixed time
		if (text.startsWith('select max("consumptions"')) {
			return [[lastConsumedAt]]
		}

		// the Topics a list names and their favicons return fixed rows
		if (text.startsWith(TOPICS_READ_PREFIX)) {
			return [["topic-1", "Espresso", "Grinders and burrs", "public", USER_ID, null]]
		}
		if (text.startsWith('select "host" from "favicons"')) {
			return [["example.com"]]
		}

		// a consumption's insert holds its user and finding in turn, after the row's generated id and time
		if (text.startsWith('insert into "consumptions"')) {
			for (const { findingId } of unreadFindings.filter(({ findingId }) => values.includes(findingId))) {
				consumedFindingIds.add(findingId)
			}
		}
		// every other query returns no rows
		return []
	})
	return { sentQueries, consumedFindingIds }
}

// the inserts of one table
function toInserts(sentQueries: SentQuery[], table: string): SentQuery[] {
	return sentQueries.filter(({ text }) => text.startsWith(`insert into "${table}"`))
}

// build an unscoped list, which always returns one
async function buildUnscopedUpdates(minutes: 5 | 15 | 30 = 15): Promise<BuiltUpdates> {
	const updates = await buildUpdates({ ...UPDATES_OPTIONS, minutes })
	if (!updates) {
		throw new Error("Expected a list")
	}
	return updates
}

// every list reads a fixed opener
beforeEach(() => {
	spyOn(updatesOpener, "loadUpdatesOpener").mockResolvedValue("Carl's line.")
})

// put the connection pool and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

test("a Finding that arrived after the last read time passes an older one of equal score", () => {
	const olderRow = toRankedRow("older", 0.8, BEFORE_LAST_CONSUMED_AT)
	const newerRow = toRankedRow("newer", 0.8, AFTER_LAST_CONSUMED_AT)
	expect(rankFindingRows([olderRow, newerRow], LAST_CONSUMED_AT).map((row) => row.findingId)).toEqual([
		"newer",
		"older",
	])
})

test("the boost moves a new Finding past a slightly higher older one, and no further", () => {
	const olderRow = toRankedRow("older", 0.85, BEFORE_LAST_CONSUMED_AT)
	const newerRow = toRankedRow("newer", 0.8, AFTER_LAST_CONSUMED_AT)
	const topRow = toRankedRow("top", 0.95, BEFORE_LAST_CONSUMED_AT)
	const rankedRows = rankFindingRows([olderRow, newerRow, topRow], LAST_CONSUMED_AT)
	expect(rankedRows.map((row) => row.findingId)).toEqual(["top", "newer", "older"])
})

test("with no consumptions no Finding gets the boost, and every one ranks by score", () => {
	const olderRow = toRankedRow("older", 0.85, BEFORE_LAST_CONSUMED_AT)
	const newerRow = toRankedRow("newer", 0.8, AFTER_LAST_CONSUMED_AT)
	expect(rankFindingRows([newerRow, olderRow], null).map((row) => row.findingId)).toEqual(["older", "newer"])
})

test("an equal score and time settles on the Finding id, so the order is stable", () => {
	const rowB = toRankedRow("finding-b", 0.8, BEFORE_LAST_CONSUMED_AT)
	const rowA = toRankedRow("finding-a", 0.8, BEFORE_LAST_CONSUMED_AT)
	expect(rankFindingRows([rowB, rowA], LAST_CONSUMED_AT).map((row) => row.findingId)).toEqual([
		"finding-a",
		"finding-b",
	])
})

test("the last read time sets only the boost, so a Finding older than it stays ranked", () => {
	const olderRow = toRankedRow("older", 0.8, BEFORE_LAST_CONSUMED_AT)
	expect(rankFindingRows([olderRow], LAST_CONSUMED_AT)).toEqual([olderRow])
})

test("the budget keeps ranked Findings up to its minutes", () => {
	const rankedRows = ["a", "b", "c", "d", "e"].map((findingId) => toRankedRow(findingId, 0.8, BEFORE_LAST_CONSUMED_AT))
	expect(trimToReadingBudget(rankedRows, 15).map((row) => row.findingId)).toEqual(["a", "b", "c"])
})

test("a long Finding does not end the list, and a shorter one after it joins", () => {
	const longRow = { ...toRankedRow("long", 0.8, BEFORE_LAST_CONSUMED_AT), contentBytes: 15_000 }
	const rankedRows = [
		toRankedRow("first", 0.9, BEFORE_LAST_CONSUMED_AT),
		longRow,
		toRankedRow("short", 0.7, BEFORE_LAST_CONSUMED_AT),
	]
	expect(trimToReadingBudget(rankedRows, 12).map((row) => row.findingId)).toEqual(["first", "short"])
})

test("one Finding longer than the budget still shows", () => {
	const longRow = { ...toRankedRow("long", 0.8, BEFORE_LAST_CONSUMED_AT), contentBytes: 150_000 }
	expect(trimToReadingBudget([longRow], 5)).toEqual([longRow])
})

test("no list is left for an empty read", () => {
	expect(trimToReadingBudget([], 15)).toEqual([])
})

test("the read covers followed Topics, leaves out a read Finding, and keeps both visibility gates", async () => {
	const { sentQueries } = stubFindingStore([{ findingId: "finding-1" }])
	await buildUnscopedUpdates()

	// the read joins the subscribed Topics, and reads no Finding rated down or marked read
	const unreadQuery = sentQueries.find(({ text }) => text.includes("count(*) over ()"))
	expect(unreadQuery?.text).toContain('from "subscriptions"')
	expect(unreadQuery?.text).toContain('"consumptions"."id" is null')
	expect(unreadQuery?.text).toContain("is distinct from 'down'")

	// a private Topic reads only for a role on it, and an invite Topic only from its activation on
	expect(unreadQuery?.text).toContain('"topics"."visibility" <>')
	expect(unreadQuery?.values).toContain("private")
	expect(unreadQuery?.values).toContain("invite")
	expect(unreadQuery?.text).toContain('min("created_at")')

	// a private Topic another user owns stays out until its generated text is converted
	expect(unreadQuery?.text).toContain('from "topic_personal_source_contexts"')
	expect(unreadQuery?.text).toContain('"topic_personal_source_contexts"."public_outputs_version" =')
})

test("a scoped list reads its one Topic and boosts from that Topic's last read time", async () => {
	// a public Topic the user does not subscribe to, which they may read
	const topic = { id: "topic-9", name: "Moka pots" } as typeof topics.$inferSelect
	spyOn(accessibleFindings, "loadViewableTopic").mockResolvedValue(topic)
	const { sentQueries } = stubFindingStore([{ findingId: "finding-1" }])
	const updates = await buildUpdates({ ...UPDATES_OPTIONS, topicId: topic.id })

	// the read names the Topic and not the subscriptions, and the last read time reads that Topic's consumptions alone
	const unreadQuery = sentQueries.find(({ text }) => text.includes("count(*) over ()"))
	const lastConsumedQuery = sentQueries.find(({ text }) => text.startsWith('select max("consumptions"'))
	expect(unreadQuery?.text).not.toContain('from "subscriptions" where "subscriptions"."is_active"')
	expect(unreadQuery?.values).toContain(topic.id)
	expect(lastConsumedQuery?.text).toContain('"findings"."topic_id" =')
	expect(lastConsumedQuery?.values).toContain(topic.id)

	// the more link opens the Topic's page
	expect(updates?.morePath).toBe("/topics/topic-9/moka-pots")
})

test("an unscoped list boosts from the newest consumption, and its more link opens the home page", async () => {
	const { sentQueries } = stubFindingStore([{ findingId: "finding-1" }])
	const updates = await buildUnscopedUpdates()
	const lastConsumedQuery = sentQueries.find(({ text }) => text.startsWith('select max("consumptions"'))
	expect(lastConsumedQuery?.text).not.toContain('"findings"."topic_id" =')
	expect(updates.morePath).toBe("/")
})

test("a Topic the user may not read returns no list and writes nothing", async () => {
	spyOn(accessibleFindings, "loadViewableTopic").mockResolvedValue(null)
	const { sentQueries } = stubFindingStore([{ findingId: "finding-1" }])
	expect(await buildUpdates({ ...UPDATES_OPTIONS, topicId: "private-topic" })).toBeNull()
	expect(sentQueries).toEqual([])
})

test("what does not fit counts toward more and stays unread", async () => {
	// four Findings of five minutes each, in a five minute budget
	const unreadFindings = ["a", "b", "c", "d"].map((findingId) => ({ findingId }))
	const { sentQueries, consumedFindingIds } = stubFindingStore(unreadFindings)
	const updates = await buildUnscopedUpdates(5)
	expect(updates.findings.map((finding) => finding.findingId)).toEqual(["a"])
	expect(updates.moreCount).toBe(3)

	// the one write marks the list's Finding alone
	expect([...consumedFindingIds]).toEqual(["a"])
	expect(toInserts(sentQueries, "consumptions")).toHaveLength(1)
})

test("two lists in a row share no Finding", async () => {
	const unreadFindings = ["a", "b", "c", "d"].map((findingId) => ({ findingId }))
	stubFindingStore(unreadFindings)
	const firstUpdates = await buildUnscopedUpdates(5)
	const secondUpdates = await buildUnscopedUpdates(5)
	// each list returns the next unread Finding
	expect(firstUpdates.findings.map((finding) => finding.findingId)).toEqual(["a"])
	expect(secondUpdates.findings.map((finding) => finding.findingId)).toEqual(["b"])
	expect(secondUpdates.moreCount).toBe(2)
})

test("a list's Findings return as unread rows, with their Topic and reading time", async () => {
	stubFindingStore([{ findingId: "finding-1", contentBytes: 15_000 }])
	const updates = await buildUnscopedUpdates()
	expect(updates.findings[0]).toMatchObject({
		isConsumed: false,
		topicId: "topic-1",
		topicName: "Espresso",
		topicPath: "/topics/topic-1/espresso",
		readingMinutes: 10,
	})
})

test("a list's rows name their stored favicon", async () => {
	stubFindingStore([{ findingId: "finding-1" }])
	const updates = await buildUnscopedUpdates()
	expect(updates.findings[0]?.faviconPath).toBe("/api/favicons/example.com")
})

test("a list reads each Finding's Topic once, before its consumptions", async () => {
	const { sentQueries } = stubFindingStore([{ findingId: "finding-1" }, { findingId: "finding-2" }])
	const updates = await buildUnscopedUpdates()
	expect(updates.topics).toMatchObject([{ id: "topic-1", name: "Espresso", prompt: "Grinders and burrs" }])

	// the one Topic read comes before the consumptions
	const topicsReadIndex = sentQueries.findIndex(({ text }) => text.startsWith(TOPICS_READ_PREFIX))
	const consumptionInsertIndex = sentQueries.findIndex(({ text }) => text.startsWith('insert into "consumptions"'))
	expect(sentQueries[topicsReadIndex]?.values).toEqual(["topic-1"])
	expect(topicsReadIndex).toBeLessThan(consumptionInsertIndex)
})

test("a Finding that would overflow the page counts toward more and stays unread", async () => {
	// three Findings of 15,000 characters each. the page holds two of them
	const relevanceExplanation = "a".repeat(15_000)
	const unreadFindings = ["a", "b", "c"].map((findingId) => ({ findingId, relevanceExplanation, contentBytes: 60 }))
	const { consumedFindingIds } = stubFindingStore(unreadFindings)
	const updates = await buildUnscopedUpdates(30)
	// the third Finding counts toward more and stays unread
	expect(updates.findings.map((finding) => finding.findingId)).toEqual(["a", "b"])
	expect(updates.moreCount).toBe(1)
	expect(JSON.stringify(updates).length).toBeLessThanOrEqual(MCP_PAGE_MAX_CHARS)
	expect([...consumedFindingIds]).toEqual(["a", "b"])
})

test("the model's fenced copy of a full list fits the page", async () => {
	// more short Findings than the page holds, each short enough that the fences add the most
	const relevanceExplanation = "a".repeat(600)
	const unreadFindings = Array.from({ length: 60 }, (_, i) => ({
		findingId: `finding-${i}`,
		relevanceExplanation,
		contentBytes: 60,
	}))
	stubFindingStore(unreadFindings)
	const updates = await buildUnscopedUpdates(30)
	expect(updates.moreCount).toBeGreaterThan(0)
	expect(JSON.stringify(toFencedUpdates(updates)).length).toBeLessThanOrEqual(MCP_PAGE_MAX_CHARS)
})

test("a list's consumptions store what a single consumption stores and track one event with the count", async () => {
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})
	const unreadFindings = ["opened", "dismissed"].map((findingId) => ({ findingId, contentBytes: 60 }))
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes("count(*) over ()")) {
			return unreadFindings.map((unreadFinding) => toUnreadRow(unreadFinding, unreadFindings.length))
		}

		// the user opened one of the two Findings, which records no dismissal
		return text.startsWith('select distinct "finding_id"') ? [["opened"]] : []
	})
	await buildUnscopedUpdates()

	// one insert of each kind, and a dismissal for the unopened Finding alone
	const [viewInsert, ...otherViewInserts] = toInserts(sentQueries, "finding_views")
	expect(otherViewInserts).toEqual([])
	expect(viewInsert?.values).toContain("dismissed")
	expect(viewInsert?.values).not.toContain("opened")
	expect(toInserts(sentQueries, "consumptions")[0]?.text).toContain("on conflict do nothing")

	// the one event counts both Findings
	expect(trackEventSpy.mock.calls.filter(([event]) => event === "finding_read")).toHaveLength(1)
	expect(trackEventSpy).toHaveBeenCalledWith("finding_read", USER_ID, {
		...TEST_ANALYTICS_PROPERTIES,
		findingCount: 2,
	})
})

test("an empty list runs no opener and writes nothing", async () => {
	const openerSpy = spyOn(updatesOpener, "loadUpdatesOpener")
	const { sentQueries } = stubFindingStore([])
	const updates = await buildUnscopedUpdates()
	expect(updates).toEqual({
		opener: null,
		findings: [],
		moreCount: 0,
		morePath: "/",
		topics: [],
		podcastEpisodes: [],
	})
	expect(openerSpy).not.toHaveBeenCalled()
	expect(toInserts(sentQueries, "consumptions")).toEqual([])
})

test("a list reports its counts, and a scoped list reports its Topic", async () => {
	const trackEventSpy = spyOn(analytics, "trackEvent")
	stubFindingStore([{ findingId: "finding-1" }])
	await buildUnscopedUpdates(5)
	expect(trackEventSpy).toHaveBeenCalledWith("updates_requested", USER_ID, {
		...TEST_ANALYTICS_PROPERTIES,
		minutes: 5,
		findingCount: 1,
		moreCount: 0,
		hasOpener: true,
	})

	// a scoped list names its Topic
	const topic = { id: "topic-9", name: "Moka pots" } as typeof topics.$inferSelect
	spyOn(accessibleFindings, "loadViewableTopic").mockResolvedValue(topic)
	stubFindingStore([{ findingId: "finding-2" }])
	await buildUpdates({ ...UPDATES_OPTIONS, topicId: topic.id })
	expect(trackEventSpy.mock.lastCall?.[2]).toMatchObject({ topicId: topic.id, minutes: 15 })
})

test("an empty list still reports, and a Topic the user may not read reports nothing", async () => {
	const trackEventSpy = spyOn(analytics, "trackEvent")
	stubFindingStore([])
	await buildUnscopedUpdates()
	expect(trackEventSpy.mock.lastCall?.[0]).toBe("updates_requested")
	expect(trackEventSpy.mock.lastCall?.[2]).toMatchObject({ findingCount: 0, moreCount: 0, hasOpener: false })

	// the rejected list adds no event
	trackEventSpy.mockClear()
	spyOn(accessibleFindings, "loadViewableTopic").mockResolvedValue(null)
	await buildUpdates({ ...UPDATES_OPTIONS, topicId: "private-topic" })
	expect(trackEventSpy).not.toHaveBeenCalled()
})
