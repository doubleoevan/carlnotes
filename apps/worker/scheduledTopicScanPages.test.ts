// scheduled topic page tests: a sweep reads its scheduled Topics a page at a time, the Topics that have waited longest
// first, and reads limits for no Topic behind the pages it starts
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as quotas from "@carlnotes/db/quotas"
import * as scan from "@carlnotes/pipeline/scan"
import * as temporalClient from "@carlnotes/pipeline/temporalClient"
import * as monitoring from "@carlnotes/server/monitoring"
import * as scheduledTopicLimits from "./scheduledTopicLimits"
import * as scheduledTopicPages from "./scheduledTopicPages"
import { startScheduledTopicScanPages } from "./scheduledTopicScans"
import { STARTED_TOPIC_SCAN_START, toScheduledTopic } from "./scheduledTopicTestFixtures"

// put each spied function and the connection pool's own query back after each test, whether its assertions pass or not
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the scheduled Topics in the order the sweep reads them, each named by its place, and what a sweep's reads saw
type PagedSweep = {
	pageReads: { firstTopicId: string | undefined; topicCount: number }[]
	limitReadTopicIds: string[][]
	startedTopicIds: string[]
}

// stub a sweep over the given count of scheduled Topics: the ids in sweep order, each page's Topics, each page's
// limits, with the given owners over quota, and the starts. topic-000 is the Topic that has waited longest
function stubPagedSweep(scheduledTopicCount: number, overQuotaOwnerIds: string[] = []): PagedSweep {
	const scheduledTopics = Array.from({ length: scheduledTopicCount }, (_, place) =>
		toScheduledTopic(`topic-${String(place).padStart(3, "0")}`, `owner-${place % 3}`),
	)
	const pagedSweep: PagedSweep = { pageReads: [], limitReadTopicIds: [], startedTopicIds: [] }
	spyOn(scheduledTopicPages, "loadScheduledTopicIds").mockResolvedValue(scheduledTopics.map((topic) => topic.id))

	// a page is the Topics of the page's ids, in the order of the ids
	spyOn(scheduledTopicPages, "loadScheduledTopics").mockImplementation(async (topicIds) => {
		pagedSweep.pageReads.push({ firstTopicId: topicIds[0], topicCount: topicIds.length })
		return scheduledTopics.filter((topic) => topicIds.includes(topic.id))
	})

	// the limits are read for the page's Topics alone, and no owner is past a cutoff or a budget
	spyOn(scheduledTopicLimits, "loadScheduledTopicLimits").mockImplementation(async (pageTopics) => {
		pagedSweep.limitReadTopicIds.push(pageTopics.map((topic) => topic.id))
		return { dailyTopicIdsByOwner: new Map(), dailyTopicOnWeeklyScanIds: new Set(), budgetExhaustedOwnerIds: new Set() }
	})
	spyOn(scheduledTopicLimits, "loadDailySpendCutoffOwnerIds").mockResolvedValue(new Set())
	spyOn(quotas, "scansRemainingToday").mockImplementation(async (ownerId) =>
		overQuotaOwnerIds.includes(ownerId) ? 0 : 1000,
	)
	spyOn(scan, "startTopicScan").mockImplementation(async (topicId): Promise<scan.TopicScanStart> => {
		pagedSweep.startedTopicIds.push(topicId)
		return STARTED_TOPIC_SCAN_START
	})
	return pagedSweep
}

// start a paged sweep's Scans with the given dispatch count
function startPagedSweep(dispatchableScanCount: number | null): ReturnType<typeof startScheduledTopicScanPages> {
	return startScheduledTopicScanPages({
		now: new Date("2026-11-20T12:00:00Z"),
		cutoffState: {} as never,
		waitingScanTopicIds: new Set(),
		dispatchableScanCount,
		signal: new AbortController().signal,
	})
}

test("a sweep reads one page of the Topics that have waited longest, and limits for no Topic behind them", async () => {
	// 300 scheduled Topics, and a sweep that may start 100 Scans
	const pagedSweep = stubPagedSweep(300)
	const topicSweepSummary = await startPagedSweep(100)

	// one page of 100 from the start of the order, whose Topics alone had their limits read, and all of them started
	expect(pagedSweep.pageReads).toEqual([{ firstTopicId: "topic-000", topicCount: 100 }])
	expect(pagedSweep.limitReadTopicIds.map((topicIds) => topicIds.length)).toEqual([100])
	expect(pagedSweep.startedTopicIds).toHaveLength(100)
	expect(pagedSweep.startedTopicIds.slice(0, 2)).toEqual(["topic-000", "topic-001"])
	expect(pagedSweep.startedTopicIds.at(-1)).toBe("topic-099")

	// the 200 Topics behind them were never read, and stay scheduled behind the backlog
	expect(topicSweepSummary).toMatchObject({ scheduled: 300, started: 100, skippedOverBacklog: 200 })
})

test("a sweep reads on past the Topics it has to skip until it has started as many Scans as it may", async () => {
	// one owner in three is over quota, so a page of 30 starts 20 Scans
	const pagedSweep = stubPagedSweep(300, ["owner-0"])
	const topicSweepSummary = await startPagedSweep(30)

	// the second page starts after the first page's last Topic, and holds the fewest Topics a page may
	expect(pagedSweep.pageReads).toEqual([
		{ firstTopicId: "topic-000", topicCount: 30 },
		{ firstTopicId: "topic-030", topicCount: 20 },
	])
	expect(pagedSweep.startedTopicIds).toHaveLength(30)
	expect(pagedSweep.startedTopicIds.at(-1)).toBe("topic-044")

	// ten over quota on the first page and five on the second, five read behind the last start, and 250 never read
	expect(topicSweepSummary).toMatchObject({
		scheduled: 300,
		started: 30,
		skippedOverQuota: 15,
		skippedOverBacklog: 255,
	})
})

test("a sweep that may start more Scans than are scheduled reads every page and leaves none behind", async () => {
	const pagedSweep = stubPagedSweep(250)
	const topicSweepSummary = await startPagedSweep(1000)

	// pages of the most Topics a page may hold, and a short page that ends the read
	expect(pagedSweep.pageReads).toEqual([
		{ firstTopicId: "topic-000", topicCount: 200 },
		{ firstTopicId: "topic-200", topicCount: 50 },
	])
	expect(topicSweepSummary).toMatchObject({ scheduled: 250, started: 250, skippedOverBacklog: 0 })
})

test("a sweep that could not read the scheduled queue reads no page and leaves every Topic", async () => {
	const pagedSweep = stubPagedSweep(40)
	const topicSweepSummary = await startPagedSweep(null)
	expect(pagedSweep.pageReads).toEqual([])
	expect(topicSweepSummary).toMatchObject({ scheduled: 40, started: 0, skippedTemporalOutage: 40 })
})

test("a start that cannot reach Temporal ends the sweep's pages, and every Topic after it stays scheduled", async () => {
	// the third start fails with a transport failure
	const pagedSweep = stubPagedSweep(300)
	spyOn(console, "error").mockImplementation(() => {})
	spyOn(monitoring, "reportError").mockImplementation(() => {})
	spyOn(temporalClient, "isTemporalTransportFailure").mockReturnValue(true)

	// every other start succeeds
	spyOn(scan, "startTopicScan").mockImplementation(async (topicId): Promise<scan.TopicScanStart> => {
		if (topicId === "topic-002") {
			throw new Error("the temporal server is unavailable")
		}
		return STARTED_TOPIC_SCAN_START
	})
	const topicSweepSummary = await startPagedSweep(100)

	// one page was read, two Scans started, and the 297 Topics after the failed start stay scheduled
	expect(pagedSweep.pageReads).toHaveLength(1)
	expect(topicSweepSummary).toMatchObject({ scheduled: 300, started: 2, failed: 1, skippedTemporalOutage: 297 })
})
