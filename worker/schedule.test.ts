// schedule tests: starting the scheduled Topics' Scans and each skip, the topic sweep summary, and the sweep without the
// budget reset
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { SCHEDULED_SCAN_SPENT_BUDGET_REASON } from "@shared/scanFailure"
import { restoreConnectionPool, stubConnectionPool } from "../db/connectionPoolStub"
import * as quotas from "../db/quotas"
import * as scan from "./scan"
import { emptyTopicSweepSummary, startScheduledTopicScans } from "./schedule"
import { toScheduledTopic } from "./scheduledTopicTestFixtures"

// put each spied function and the connection pool's own query back after each test, whether its assertions pass or not
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// one owner's remaining scan count is read once, and each start lowers the sweep's copy of that count
test("ten scheduled topics of one owner with two remaining scans read the quota once, start two, and skip eight", async () => {
	// ten weekly topics of one owner, and the counts that the spies record
	const scheduledTopics = Array.from({ length: 10 }, (_, index) => toScheduledTopic(`topic-${index}`))
	let remainingScanCountLoadCount = 0
	const startedTopicIds: string[] = []

	// a quota read that counts its calls, and a start that always succeeds
	spyOn(quotas, "scansRemainingToday").mockImplementation(async () => {
		remainingScanCountLoadCount++
		return 2
	})
	spyOn(scan, "startTopicScan").mockImplementation(async (topicId): Promise<scan.TopicScanStart> => {
		startedTopicIds.push(topicId)
		return { status: "started", scan: {} as never, whenFinished: async () => {} }
	})

	// start the scheduled Topics' Scans
	const topicSweepSummary = await startScheduledTopicScans({
		scheduledTopics,
		dailyTopicIdsByOwner: new Map(),
		budgetExhaustedOwnerIds: new Set(),
	})

	// one read, two starts, eight skipped over quota
	expect(remainingScanCountLoadCount).toBe(1)
	expect(startedTopicIds).toEqual(["topic-0", "topic-1"])
	expect(topicSweepSummary).toEqual({
		scheduled: 10,
		started: 2,
		skippedOverQuota: 8,
		skippedOverDailyLimit: 0,
		skippedOverDailyScanCutoff: 0,
		skippedOverBudget: 0,
		skippedOverBacklog: 0,
		failed: 0,
	})
})

// a sweep starts no more Scans than the backlog allows, and leaves the rest due for the next sweep
test("a sweep past its dispatchable scan count leaves the remaining topics for the next sweep", async () => {
	// five topics of one owner with plenty of quota, and room to start two
	const scheduledTopics = Array.from({ length: 5 }, (_, index) => toScheduledTopic(`topic-${index}`))
	spyOn(quotas, "scansRemainingToday").mockResolvedValue(10)
	const startedTopicIds: string[] = []
	spyOn(scan, "startTopicScan").mockImplementation(async (topicId): Promise<scan.TopicScanStart> => {
		startedTopicIds.push(topicId)
		return { status: "started", scan: {} as never, whenFinished: async () => {} }
	})

	// two start, three wait for the next sweep
	const topicSweepSummary = await startScheduledTopicScans({
		scheduledTopics,
		dailyTopicIdsByOwner: new Map(),
		budgetExhaustedOwnerIds: new Set(),
		dispatchableScanCount: 2,
	})
	expect(startedTopicIds).toEqual(["topic-0", "topic-1"])
	expect(topicSweepSummary.started).toBe(2)
	expect(topicSweepSummary.skippedOverBacklog).toBe(3)
})

// a sweep whose claim is lost mid-run starts no further Scan and rejects with the claim's error
test("a sweep whose claim is lost stops before its next topic", async () => {
	// three topics of one owner, and a start that aborts the sweep's claim after the first Scan starts
	spyOn(quotas, "scansRemainingToday").mockResolvedValue(10)
	const claimAbortController = new AbortController()
	const startedTopicIds: string[] = []
	spyOn(scan, "startTopicScan").mockImplementation(async (topicId): Promise<scan.TopicScanStart> => {
		startedTopicIds.push(topicId)
		claimAbortController.abort(new Error("the scheduled-scan-sweep claim was lost while its task ran"))
		return { status: "started", scan: {} as never, whenFinished: async () => {} }
	})

	// the sweep rejects with the claim's error, having started only the first Topic's Scan
	const sweepPromise = startScheduledTopicScans({
		scheduledTopics: [toScheduledTopic("topic-0"), toScheduledTopic("topic-1"), toScheduledTopic("topic-2")],
		dailyTopicIdsByOwner: new Map(),
		budgetExhaustedOwnerIds: new Set(),
		signal: claimAbortController.signal,
	})
	await expect(sweepPromise).rejects.toThrow("claim was lost")
	expect(startedTopicIds).toEqual(["topic-0"])
})

// a scan that Temporal reports as already running spends no quota, and a start that throws an error counts as failed
test("a running scan spends nothing and a failed start is counted", async () => {
	// a busy topic and a broken topic under one owner with one remaining scan, and a quiet console
	spyOn(console, "error").mockImplementation(() => {})
	spyOn(quotas, "scansRemainingToday").mockResolvedValue(1)
	spyOn(scan, "startTopicScan").mockImplementation(async (topicId): Promise<scan.TopicScanStart> => {
		if (topicId === "broken") {
			throw new Error("temporal unreachable")
		}
		return { status: "running" }
	})

	// start the scheduled Topics' Scans
	const topicSweepSummary = await startScheduledTopicScans({
		scheduledTopics: [toScheduledTopic("busy"), toScheduledTopic("broken")],
		dailyTopicIdsByOwner: new Map(),
		budgetExhaustedOwnerIds: new Set(),
	})

	// the busy topic spends nothing and the broken topic counts as failed
	expect(topicSweepSummary).toEqual({
		scheduled: 2,
		started: 0,
		skippedOverQuota: 0,
		skippedOverDailyLimit: 0,
		skippedOverDailyScanCutoff: 0,
		skippedOverBudget: 0,
		skippedOverBacklog: 0,
		failed: 1,
	})
})

// an owner whose budget is spent gets a failed Scan row for each Topic instead of a started Scan
test("each Topic whose owner's budget is spent saves a failed Scan with the budget reason and starts nothing", async () => {
	// owner-1's budget is spent and owner-2's is not, and both have scans left today
	const sentQueries = stubConnectionPool()
	spyOn(quotas, "scansRemainingToday").mockResolvedValue(5)
	const startTopicScanSpy = spyOn(scan, "startTopicScan").mockResolvedValue({
		status: "started",
		scan: {} as never,
		whenFinished: async () => {},
	})

	// start the scheduled Topics' Scans
	const topicSweepSummary = await startScheduledTopicScans({
		scheduledTopics: [
			toScheduledTopic("a", "owner-1"),
			toScheduledTopic("b", "owner-1"),
			toScheduledTopic("c", "owner-2"),
		],
		dailyTopicIdsByOwner: new Map(),
		budgetExhaustedOwnerIds: new Set(["owner-1"]),
	})

	// owner-2's Topic starts, and owner-1's two Topics are counted over budget
	expect(startTopicScanSpy.mock.calls.map(([topicId]) => topicId)).toEqual(["c"])
	expect(topicSweepSummary).toEqual({
		scheduled: 3,
		started: 1,
		skippedOverQuota: 0,
		skippedOverDailyLimit: 0,
		skippedOverDailyScanCutoff: 0,
		skippedOverBudget: 2,
		skippedOverBacklog: 0,
		failed: 0,
	})

	// each of owner-1's Topics saved a failed Scan with the budget reason
	const scanInserts = sentQueries.filter((sentQuery) => sentQuery.text.startsWith('insert into "scans"'))
	expect(scanInserts.map((scanInsert) => scanInsert.values)).toEqual([
		expect.arrayContaining(["a", "owner-1", "failed", SCHEDULED_SCAN_SPENT_BUDGET_REASON]),
		expect.arrayContaining(["b", "owner-1", "failed", SCHEDULED_SCAN_SPENT_BUDGET_REASON]),
	])
})

// the daily scan limit is checked before the budget. a Topic over its owner's daily scan limit saves no failed Scan
test("a Topic over its owner's daily scan limit saves no failed Scan", async () => {
	// an owner with no scans left today whose budget is also spent
	const sentQueries = stubConnectionPool()
	spyOn(quotas, "scansRemainingToday").mockResolvedValue(0)

	// start the scheduled Topics' Scans
	const topicSweepSummary = await startScheduledTopicScans({
		scheduledTopics: [toScheduledTopic("a")],
		dailyTopicIdsByOwner: new Map(),
		budgetExhaustedOwnerIds: new Set(["owner-1"]),
	})

	// the Topic is counted over quota, and nothing was written
	expect(topicSweepSummary).toMatchObject({ skippedOverQuota: 1, skippedOverBudget: 0 })
	expect(sentQueries).toHaveLength(0)
})

// the daily topic limit is checked before the budget.
// a daily Topic past its owner's daily topic limit saves no failed Scan
test("a daily Topic past its owner's daily topic limit saves no failed Scan", async () => {
	// a daily Topic outside its owner's allowance, whose owner has scans left today and a spent budget
	const sentQueries = stubConnectionPool()
	spyOn(quotas, "scansRemainingToday").mockResolvedValue(5)
	const dailyTopic = { ...toScheduledTopic("a"), frequency: "daily" as const }

	// start the scheduled Topics' Scans
	const topicSweepSummary = await startScheduledTopicScans({
		scheduledTopics: [dailyTopic],
		dailyTopicIdsByOwner: new Map(),
		budgetExhaustedOwnerIds: new Set(["owner-1"]),
	})

	// the Topic is counted past the daily topic limit, and nothing was written
	expect(topicSweepSummary).toMatchObject({ skippedOverDailyLimit: 1, skippedOverBudget: 0 })
	expect(sentQueries).toHaveLength(0)
})

// a Topic whose owner's budget is spent saves no failed Scan if the Topic has a Scan that is still running
test("a Topic with a running Scan saves no failed Scan, even if its owner's budget is spent", async () => {
	// every select returns a running Scan's id, and the owner has scans left today
	const sentQueries = stubConnectionPool(() => [["scan-1"]])
	spyOn(quotas, "scansRemainingToday").mockResolvedValue(5)
	const startTopicScanSpy = spyOn(scan, "startTopicScan")

	// start the scheduled Topics' Scans
	const topicSweepSummary = await startScheduledTopicScans({
		scheduledTopics: [toScheduledTopic("a")],
		dailyTopicIdsByOwner: new Map(),
		budgetExhaustedOwnerIds: new Set(["owner-1"]),
	})

	// the Topic's running Scans were read, nothing was inserted or started, and the Topic is counted nowhere
	expect(sentQueries.map((sentQuery) => sentQuery.text.split(" ")[0])).toEqual(["select"])
	expect(sentQueries[0]?.text).toContain('"scans"."topic_id" = $1 and "scans"."status" = $2')
	expect(sentQueries[0]?.values).toEqual(expect.arrayContaining(["a", "running"]))
	expect(startTopicScanSpy).not.toHaveBeenCalled()
	expect(topicSweepSummary).toMatchObject({ started: 0, skippedOverBudget: 0, failed: 0 })
})

// a daily Topic that runs weekly and already scanned this week waits, and is counted past the daily scans cutoff
test("a daily Topic that runs weekly and scanned this week starts no Scan", async () => {
	// a daily Topic within its owner's allowance, whose owner has scans left today
	stubConnectionPool()
	spyOn(quotas, "scansRemainingToday").mockResolvedValue(5)
	const startTopicScanSpy = spyOn(scan, "startTopicScan")
	const dailyTopic = { ...toScheduledTopic("a"), frequency: "daily" as const }

	// start the scheduled Topics' Scans with the Topic running weekly
	const topicSweepSummary = await startScheduledTopicScans({
		scheduledTopics: [dailyTopic],
		dailyTopicIdsByOwner: new Map([["owner-1", new Set(["a"])]]),
		dailyTopicOnWeeklyScanIds: new Set(["a"]),
		budgetExhaustedOwnerIds: new Set(),
	})

	// the Topic is counted past the daily scans cutoff, and nothing started
	expect(topicSweepSummary).toMatchObject({ started: 0, skippedOverDailyScanCutoff: 1 })
	expect(startTopicScanSpy).not.toHaveBeenCalled()
})

// the sweep hands each Scan to Temporal and does not wait, so its summary count starts
test("a topic sweep summary counts starts instead of outcomes", () => {
	const topicSweepSummary = emptyTopicSweepSummary(1)
	expect(Object.keys(topicSweepSummary).sort()).toEqual([
		"failed",
		"scheduled",
		"skippedOverBacklog",
		"skippedOverBudget",
		"skippedOverDailyLimit",
		"skippedOverDailyScanCutoff",
		"skippedOverQuota",
		"started",
	])
})

// the monthly budget reset runs as its own daily job, so the sweep's source never names resetMonthlyBudgets
test("the sweep never calls the monthly budget reset", async () => {
	const scheduleSource = await Bun.file(new URL("./schedule.ts", import.meta.url)).text()
	expect(scheduleSource).not.toContain("resetMonthlyBudgets")
})
