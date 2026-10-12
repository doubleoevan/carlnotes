// schedule tests: starting the scheduled Topics' Scans, the owners whose budget is spent, the topic sweep summary, and
// the sweep without the budget reset
import { afterEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import { quietErrorReports } from "@shared/monitoringTestFixtures"
import { saveEnvSettings } from "@shared/savedEnvSettings"
import { SCHEDULED_SCAN_SPENT_BUDGET_REASON } from "@shared/scanFailure"
import { restoreConnectionPool, stubConnectionPool } from "../db/connectionPoolStub"
import * as quotas from "../db/quotas"
import type { topics } from "../db/schema/topics"
import * as litellm from "./litellm"
import * as scan from "./scan"
import { emptyTopicSweepSummary, loadBudgetExhaustedOwnerIds, startScheduledTopicScans } from "./schedule"

// a scheduled weekly Topic with only the fields that startScheduledTopicScans reads.
// the daily topic limit never skips a weekly Topic
function toScheduledTopic(id: string, ownerId = "owner-1"): typeof topics.$inferSelect {
	return { id, ownerId, frequency: "weekly" } as never
}

// stub a proxy that cannot be reached, with the proxy settings that a budget read needs, and return the fetch mock
function stubUnreachableProxy(): Mock<() => Promise<Response>> {
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "master"

	// a fetch that throws an error for every request
	const fetchMock = mock(async (): Promise<Response> => {
		throw new TypeError("fetch failed")
	})
	globalThis.fetch = fetchMock as unknown as typeof fetch
	return fetchMock
}

// put each spied function, the connection pool's own query, the real fetch, and the proxy settings back
// after each test, whether its assertions pass or not
const originalFetch = globalThis.fetch
const restoreEnvSettings = saveEnvSettings(["LITELLM_BASE_URL", "LITELLM_MASTER_KEY"])
afterEach(() => {
	restoreConnectionPool()
	globalThis.fetch = originalFetch
	mock.restore()
	restoreEnvSettings()
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
		skippedOverBudget: 0,
		skippedOverBacklog: 0,
		failed: 1,
	})
})

// each owner's budget is read once, no matter how many of that owner's Topics are scheduled.
// only an owner whose budget is spent is returned
test("each owner's budget is read once, and only an owner whose budget is spent is returned", async () => {
	// three Topics of two owners, and a budget read that finds only owner-1's budget spent
	const scheduledTopics = [
		toScheduledTopic("a", "owner-1"),
		toScheduledTopic("b", "owner-1"),
		toScheduledTopic("c", "owner-2"),
	]
	const isUserLiteLLMKeyBudgetExhaustedSpy = spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockImplementation(
		async (userId) => userId === "owner-1",
	)

	// only owner-1 is returned, and each owner's budget is read once
	expect(await loadBudgetExhaustedOwnerIds(scheduledTopics)).toEqual(new Set(["owner-1"]))
	expect(isUserLiteLLMKeyBudgetExhaustedSpy.mock.calls.map(([userId]) => userId).sort()).toEqual(["owner-1", "owner-2"])
})

// an owner whose budget read fails, or who has no key yet, is left out
test("an owner whose budget read fails or who has no key is left out", async () => {
	// an owner with a key, and a proxy that cannot be reached
	stubConnectionPool(() => [["owner@example.com", "sk-owner", "user", "free", null]])
	const fetchMock = stubUnreachableProxy()
	expect(await loadBudgetExhaustedOwnerIds([toScheduledTopic("a")])).toEqual(new Set())
	expect(fetchMock).toHaveBeenCalledTimes(1)

	// an owner with no key yet is left out, and that owner's budget is never read from the proxy
	stubConnectionPool(() => [["owner@example.com", null, "user", "free", null]])
	expect(await loadBudgetExhaustedOwnerIds([toScheduledTopic("a")])).toEqual(new Set())
	expect(fetchMock).toHaveBeenCalledTimes(1)
})

// one owner's budget read that throws an error is reported, and that owner is left out.
// the other owners' budgets are still read
test("an owner whose budget read throws an error is reported and left out", async () => {
	// owner-1's read throws an error, and owner-2's budget is spent
	const reportErrorSpy = quietErrorReports()
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockImplementation(async (userId) => {
		if (userId === "owner-1") {
			throw new Error("connection lost")
		}
		return true
	})

	// owner-2 is returned, and owner-1's failure is reported once
	const scheduledTopics = [toScheduledTopic("a", "owner-1"), toScheduledTopic("b", "owner-2")]
	expect(await loadBudgetExhaustedOwnerIds(scheduledTopics)).toEqual(new Set(["owner-2"]))
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
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

// the sweep hands each Scan to Temporal and does not wait, so its summary count starts
test("a topic sweep summary counts starts instead of outcomes", () => {
	const topicSweepSummary = emptyTopicSweepSummary(1)
	expect(Object.keys(topicSweepSummary).sort()).toEqual([
		"failed",
		"scheduled",
		"skippedOverBacklog",
		"skippedOverBudget",
		"skippedOverDailyLimit",
		"skippedOverQuota",
		"started",
	])
})

// the monthly budget reset runs as its own daily job, so the sweep's source never names resetMonthlyBudgets
test("the sweep never calls the monthly budget reset", async () => {
	const scheduleSource = await Bun.file(new URL("./schedule.ts", import.meta.url)).text()
	expect(scheduleSource).not.toContain("resetMonthlyBudgets")
})
