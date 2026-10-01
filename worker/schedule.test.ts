// schedule tests: the frequency window, the scheduled topic and stale scan filters, starting the scheduled Topics' Scans,
// the owners whose budget is spent, the topic sweep summary, the stale window, the sweep without the budget reset,
// the daily topic limit, and the scan queue report
import { afterEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { SCHEDULED_SCAN_SPENT_BUDGET_REASON } from "@shared/scanFailure"
import { connectionPool, db } from "../db"
import * as quotas from "../db/quotas"
import { scans, topics } from "../db/schema"
import * as litellm from "./litellm"
import * as scan from "./scan"
import {
	frequencyWindowMs,
	isWithinDailyTopicLimit,
	loadBudgetExhaustedOwnerIds,
	reportScanQueue,
	staleScanWindowMs,
	startScheduledTopicScans,
	type TopicSweepSummary,
	toScheduledTopicFilter,
	toStaleScanFilter,
} from "./schedule"
import { toScanBacklogCrossing } from "./temporalClient"
import {
	FINISH_ATTEMPTS,
	FINISH_TIMEOUT_MS,
	FINISH_TOTAL_TIMEOUT_MS,
	INGEST_ATTEMPTS,
	INGEST_TIMEOUT_MS,
	INGEST_TOTAL_TIMEOUT_MS,
	MAX_SCAN_DURATION_MS,
	REVIEW_ATTEMPTS,
	REVIEW_TIMEOUT_MS,
	REVIEW_TOTAL_TIMEOUT_MS,
} from "./workflows/stageTimeouts"

// one day in milliseconds, the daily frequency window
const DAY_MS = 24 * 60 * 60 * 1000

// a fresh zeroed topic sweep summary to fold outcomes into
function emptyTopicSweepSummary(): TopicSweepSummary {
	return { scheduled: 1, started: 0, skippedOverQuota: 0, skippedOverDailyLimit: 0, skippedOverBudget: 0, failed: 0 }
}

// the sql and the parameters that a select of the scheduled Topics renders on a given day
function toScheduledTopicQuery(now: Date): { sql: string; params: unknown[] } {
	return db.select({ id: topics.id }).from(topics).where(toScheduledTopicFilter(now)).toSQL()
}

// a scheduled weekly Topic with only the fields that startScheduledTopicScans reads.
// the daily topic limit never skips a weekly Topic
function toScheduledTopic(id: string, ownerId = "owner-1"): typeof topics.$inferSelect {
	return { id, ownerId, frequency: "weekly" } as never
}

// a connection pool that returns the given rows for every query and keeps each query's sql and values
function stubConnectionPool(queryRows: unknown[][] = []): { text: string; values: unknown[] }[] {
	const sentQueries: { text: string; values: unknown[] }[] = []
	connectionPool.query = ((queryConfig: { text: string }, values: unknown[]) => {
		sentQueries.push({ text: queryConfig.text, values })
		return Promise.resolve({ rows: queryRows, fields: [], rowCount: queryRows.length })
	}) as unknown as typeof connectionPool.query
	return sentQueries
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
const originalConnectionPoolQuery = connectionPool.query
const originalFetch = globalThis.fetch
const originalProxySettings = {
	LITELLM_BASE_URL: Bun.env.LITELLM_BASE_URL,
	LITELLM_MASTER_KEY: Bun.env.LITELLM_MASTER_KEY,
}
afterEach(() => {
	connectionPool.query = originalConnectionPoolQuery
	globalThis.fetch = originalFetch
	mock.restore()

	// put each proxy setting back, or delete a proxy setting that the test run never had
	for (const [proxySettingName, originalProxySetting] of Object.entries(originalProxySettings)) {
		if (originalProxySetting === undefined) {
			delete Bun.env[proxySettingName]
		} else {
			Bun.env[proxySettingName] = originalProxySetting
		}
	}
})

// the daily frequency waits a day before a re-scan, the weekly frequency waits seven
test("frequencyWindowMs is a day for daily and a week for weekly", () => {
	expect(frequencyWindowMs("daily")).toBe(DAY_MS)
	expect(frequencyWindowMs("weekly")).toBe(7 * DAY_MS)
})

// the scheduled topic filter is one sql predicate.
// a topic is scheduled if it has no completed scan, or if its last completed scan is older than its frequency window
test("the scheduled topic filter reads the last completed scan in sql with the day and week windows", () => {
	// a wednesday, so daily and weekdays both read the day window
	const now = new Date("2026-07-22T12:00:00Z")
	const { sql, params } = toScheduledTopicQuery(now)

	// the subquery over completed scans, and the null branch for a topic never scanned
	expect(sql).toContain('max("scans"."started_at")')
	expect(sql).toContain("<> 'running'")
	expect(sql).toContain("is null")

	// the weekly branch reads a week back and the daily branch a day back, for daily and weekdays alike
	expect(params).toEqual([
		"weekly",
		new Date(now.getTime() - 7 * DAY_MS),
		"daily",
		"weekdays",
		new Date(now.getTime() - DAY_MS),
	])
})

// a scanned weekdays topic drops out of the day window on a weekend and comes back on monday
test("the scheduled topic filter drops a scanned weekdays topic on a weekend", () => {
	// a saturday leaves only daily in the day window's frequencies
	const saturday = new Date("2026-07-25T12:00:00Z")
	expect(toScheduledTopicQuery(saturday).params).toEqual([
		"weekly",
		new Date(saturday.getTime() - 7 * DAY_MS),
		"daily",
		new Date(saturday.getTime() - DAY_MS),
	])

	// monday puts weekdays back in the day window
	const monday = new Date("2026-07-27T12:00:00Z")
	expect(toScheduledTopicQuery(monday).params).toContain("weekdays")
})

// the stale filter measures a picked-up scan from its pickup and a scan that no worker picked up from its dispatch
test("the stale filter measures a picked-up scan from its pickup and a queued scan from its dispatch", () => {
	const now = new Date("2026-07-22T12:00:00Z")
	const { sql, params } = db.select({ id: scans.id }).from(scans).where(toStaleScanFilter(now)).toSQL()

	// the picked-up branch compares the pickup time, and the queued branch compares the dispatch time
	expect(sql).toContain('"scans"."picked_up_at" is not null and "scans"."picked_up_at" <')
	expect(sql).toContain('"scans"."picked_up_at" is null and "scans"."dispatched_at" <')

	// the pickup cutoff is the stale window, and the dispatch cutoff is the ingest and finish total timeouts plus the margin.
	// a comparison against a timestamp column sends its date as an iso string
	const staleScanMarginMs = 15 * 60 * 1000
	expect(params).toEqual([
		"running",
		new Date(now.getTime() - staleScanWindowMs()).toISOString(),
		new Date(now.getTime() - (INGEST_TOTAL_TIMEOUT_MS + FINISH_TOTAL_TIMEOUT_MS + staleScanMarginMs)).toISOString(),
	])
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
		failed: 0,
	})
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
	stubConnectionPool([["owner@example.com", "sk-owner", "user", "free", null]])
	const fetchMock = stubUnreachableProxy()
	expect(await loadBudgetExhaustedOwnerIds([toScheduledTopic("a")])).toEqual(new Set())
	expect(fetchMock).toHaveBeenCalledTimes(1)

	// an owner with no key yet is left out, and that owner's budget is never read from the proxy
	stubConnectionPool([["owner@example.com", null, "user", "free", null]])
	expect(await loadBudgetExhaustedOwnerIds([toScheduledTopic("a")])).toEqual(new Set())
	expect(fetchMock).toHaveBeenCalledTimes(1)
})

// one owner's budget read that throws an error is reported, and that owner is left out.
// the other owners' budgets are still read
test("an owner whose budget read throws an error is reported and left out", async () => {
	// owner-1's read throws an error, and owner-2's budget is spent
	spyOn(console, "error").mockImplementation(() => {})
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
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
	const sentQueries = stubConnectionPool([["scan-1"]])
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
	const summary = emptyTopicSweepSummary()
	expect(Object.keys(summary).sort()).toEqual([
		"failed",
		"scheduled",
		"skippedOverBudget",
		"skippedOverDailyLimit",
		"skippedOverQuota",
		"started",
	])
})

// the stale scan window waits out the longest a Scan may legally run
test("the stale scan window clears the longest a Scan may legally run", () => {
	// each stage's total covers its own retries, so the summed total cannot fall behind a retry policy that changes
	expect(INGEST_TOTAL_TIMEOUT_MS).toBe(INGEST_TIMEOUT_MS * INGEST_ATTEMPTS)
	expect(REVIEW_TOTAL_TIMEOUT_MS).toBe(REVIEW_TIMEOUT_MS * REVIEW_ATTEMPTS)
	expect(FINISH_TOTAL_TIMEOUT_MS).toBe(FINISH_TIMEOUT_MS * FINISH_ATTEMPTS)

	// the window clears the across-attempts total, not the sum of one attempt per stage
	expect(MAX_SCAN_DURATION_MS).toBe(INGEST_TOTAL_TIMEOUT_MS + REVIEW_TOTAL_TIMEOUT_MS + FINISH_TOTAL_TIMEOUT_MS)
	expect(staleScanWindowMs()).toBeGreaterThan(MAX_SCAN_DURATION_MS)
})

// the monthly budget reset runs as its own daily job, so the sweep's source never names resetMonthlyBudgets
test("the sweep never calls the monthly budget reset", async () => {
	const scheduleSource = await Bun.file(new URL("./schedule.ts", import.meta.url)).text()
	expect(scheduleSource).not.toContain("resetMonthlyBudgets")
})

// the daily topic limit binds the Topics already there, not only the ones being written
test("the sweep runs only the daily Topics inside their owner's allowance", () => {
	const allowance = new Set(["kept"])

	// a daily Topic inside the allowance runs, and one outside it is skipped
	expect(isWithinDailyTopicLimit({ id: "kept", frequency: "daily" }, allowance)).toBe(true)
	expect(isWithinDailyTopicLimit({ id: "dropped", frequency: "daily" }, allowance)).toBe(false)

	// weekdays draws on the same allowance as daily, or it would be a free way around the limit
	expect(isWithinDailyTopicLimit({ id: "dropped", frequency: "weekdays" }, allowance)).toBe(false)
	expect(isWithinDailyTopicLimit({ id: "kept", frequency: "weekdays" }, allowance)).toBe(true)

	// a weekly Topic draws on no daily allowance, so the limit never reaches it
	expect(isWithinDailyTopicLimit({ id: "dropped", frequency: "weekly" }, allowance)).toBe(true)
	expect(isWithinDailyTopicLimit({ id: "dropped", frequency: "weekly" }, undefined)).toBe(true)

	// an owner with no daily Topics in this sweep has no allowance read, and no daily Topic to run either
	expect(isWithinDailyTopicLimit({ id: "kept", frequency: "daily" }, undefined)).toBe(false)
})

// a Scan queue with a worker polling it and nothing waiting
const HEALTHY_SCAN_QUEUE = { pollerCount: 1, backlogCount: 0, oldestBacklogAgeMs: 0 }

// the sweep reports a queue nothing polls, and a backlog whose oldest Scan waited past 15 minutes
test("reportScanQueue reports a queue nothing polls and a backlog past its limit", async () => {
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	await reportScanQueue(async () => HEALTHY_SCAN_QUEUE)
	expect(consoleErrorSpy).not.toHaveBeenCalled()

	// a queue nothing polls
	await reportScanQueue(async () => ({ ...HEALTHY_SCAN_QUEUE, pollerCount: 0 }))
	expect(String(consoleErrorSpy.mock.calls.at(-1)?.[0])).toContain("no temporal worker is polling the scan queue")

	// a queue whose oldest Scan has waited 20 minutes
	await reportScanQueue(async () => ({ pollerCount: 1, backlogCount: 12, oldestBacklogAgeMs: 20 * 60 * 1000 }))
	expect(consoleErrorSpy.mock.calls.at(-1)).toEqual([
		"a scan waited over 15 minutes for a slot",
		{ backlogCount: 12, oldestBacklogAgeMs: 20 * 60 * 1000 },
	])
})

// a describe that fails is logged, and the sweep goes on
test("reportScanQueue never fails the sweep", async () => {
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	await expect(reportScanQueue(() => Promise.reject(new Error("temporal unreachable")))).resolves.toBeUndefined()
	expect(consoleErrorSpy.mock.calls[0]?.[0]).toBe("could not read the scan task queue")
})

// an older server gives a depth and no age, so its backlog is never reported as past the limit
test("toScanBacklogCrossing needs a known age past 15 minutes", () => {
	const backedUpQueue = { pollerCount: 1, backlogCount: 40 }
	expect(toScanBacklogCrossing({ ...backedUpQueue, oldestBacklogAgeMs: null })).toBeNull()
	expect(toScanBacklogCrossing({ ...backedUpQueue, oldestBacklogAgeMs: 15 * 60 * 1000 })).toBeNull()
	expect(toScanBacklogCrossing({ ...backedUpQueue, oldestBacklogAgeMs: 16 * 60 * 1000 })?.condition).toBe(
		"scan-backlog",
	)
})
