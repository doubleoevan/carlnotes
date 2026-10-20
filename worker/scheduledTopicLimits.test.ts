// scheduled topic limit tests: the owners whose budget is spent, the daily Topics that run weekly past the daily scans
// cutoff and the cutoff cached in Redis, and the limit loads' one read of each owner's access row
import { afterEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import { quietErrorReports } from "@shared/monitoringTestFixtures"
import { saveEnvSettings } from "@shared/savedEnvSettings"
import { PLUS_USER_ACCESS_ROW, restoreConnectionPool, stubConnectionPool } from "../db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "../db/monthlyBudgetCutoffs"
import { restoreRedisClient, stubRedisClient } from "../db/redisClientStub"
import * as litellm from "./litellm"
import {
	loadBudgetExhaustedOwnerIds,
	loadDailyTopicOnWeeklyScanIds,
	loadScheduledTopicLimits,
} from "./scheduledTopicLimits"
import { toScheduledTopic } from "./scheduledTopicTestFixtures"

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

// the real fetch and the proxy settings, kept before any test replaces them
const originalFetch = globalThis.fetch
const restoreEnvSettings = saveEnvSettings(["LITELLM_BASE_URL", "LITELLM_MASTER_KEY"])

// put each spied function, the connection pool's own query, the Redis client, the real fetch, and the proxy settings
// back after each test, whether its assertions pass or not
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	globalThis.fetch = originalFetch
	mock.restore()
	restoreEnvSettings()
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

// only the daily Topics of an owner past the daily scans cutoff are read for a Scan this week. a weekly Topic and an
// owner under the cutoff are never read
test("the daily Topics on weekly scans are those of owners past the cutoff that scanned this week", async () => {
	// owner-1 is past the daily scans cutoff and owner-2 is not, and topic a scanned this week
	stubRedisClient()
	const sentQueries = stubConnectionPool(() => [["a"]])
	spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockImplementation(
		async (ownerId) => ownerId === "owner-1",
	)
	const scheduledTopics = [
		{ ...toScheduledTopic("a"), frequency: "daily" as const },
		{ ...toScheduledTopic("b"), frequency: "weekdays" as const },
		toScheduledTopic("c"),
		{ ...toScheduledTopic("d", "owner-2"), frequency: "daily" as const },
	]

	// one Scan read, for owner-1's daily Topics alone
	const dailyTopicOnWeeklyScanIds = await loadDailyTopicOnWeeklyScanIds(
		scheduledTopics,
		new Date("2026-10-20T00:00:00Z"),
	)
	expect(dailyTopicOnWeeklyScanIds).toEqual(new Set(["a"]))
	expect(sentQueries).toHaveLength(1)
	expect(sentQueries[0]?.values).toEqual(expect.arrayContaining(["a", "b", "succeeded"]))
	expect(sentQueries[0]?.values).not.toContain("d")
})

// an owner's daily scans cutoff is cached in Redis, so a second sweep within the hour reads no cutoff
test("a second sweep within the hour reads no daily scans cutoff", async () => {
	// owner-1 is past the daily scans cutoff, and their daily topic a scanned this week
	const storedValueByKey = stubRedisClient()
	stubConnectionPool(() => [["a"]])
	const isMonthlyBudgetCutoffPassedSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(
		true,
	)
	const scheduledTopics = [{ ...toScheduledTopic("a"), frequency: "daily" as const }]
	const now = new Date("2026-10-20T00:00:00Z")

	// both sweeps hold topic a to weekly, and only the first read the cutoff, which Redis caches for the owner and month
	expect(await loadDailyTopicOnWeeklyScanIds(scheduledTopics, now)).toEqual(new Set(["a"]))
	expect(await loadDailyTopicOnWeeklyScanIds(scheduledTopics, now)).toEqual(new Set(["a"]))
	expect(isMonthlyBudgetCutoffPassedSpy).toHaveBeenCalledTimes(1)
	expect(storedValueByKey.get("daily-scans-cutoff:2026-10:owner-1")).toBe("true")
})

// a cutoff read that throws an error is reported and cached nowhere, so the owner scans daily and the next sweep
// reads again
test("a failed daily scans cutoff read is reported, and the next sweep reads the cutoff again", async () => {
	// owner-1's cutoff read throws an error
	const storedValueByKey = stubRedisClient()
	const sentQueries = stubConnectionPool()
	const reportErrorSpy = quietErrorReports()
	const isMonthlyBudgetCutoffPassedSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockRejectedValue(
		new Error("connection lost"),
	)
	const scheduledTopics = [{ ...toScheduledTopic("a"), frequency: "daily" as const }]
	const now = new Date("2026-10-20T00:00:00Z")

	// each sweep runs topic a daily with no Scan read, reports the failure, and reads the cutoff again
	expect(await loadDailyTopicOnWeeklyScanIds(scheduledTopics, now)).toEqual(new Set())
	expect(await loadDailyTopicOnWeeklyScanIds(scheduledTopics, now)).toEqual(new Set())
	expect(isMonthlyBudgetCutoffPassedSpy).toHaveBeenCalledTimes(2)
	expect(reportErrorSpy).toHaveBeenCalledTimes(2)
	expect(sentQueries).toHaveLength(0)
	expect(storedValueByKey.size).toBe(0)
})

// the daily topic limit and the daily scans cutoff each read the owner's access row, and the sweep's limit loads share
// one read of it
test("the sweep's limit loads read each owner's access row once", async () => {
	// a plus owner with one daily topic and no spend
	stubRedisClient()
	const sentQueries = stubConnectionPool(({ text }) => {
		// each sum returns no spend, the access read a plus owner, the topic read topic a, and any other read no rows
		if (text.includes("sum(")) {
			return [["0"]]
		}
		if (text.includes('from "users"')) {
			return [PLUS_USER_ACCESS_ROW]
		}
		return text.includes('from "topics"') ? [["a"]] : []
	})

	// the owner's key budget has room left, and their one daily topic is scheduled
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(false)
	const scheduledTopics = [{ ...toScheduledTopic("a"), frequency: "daily" as const }]

	// topic a runs daily, and the owner's access row was read once
	const scheduledTopicLimits = await loadScheduledTopicLimits(scheduledTopics, new Date("2026-10-20T00:00:00Z"))
	expect(scheduledTopicLimits).toEqual({
		dailyTopicIdsByOwner: new Map([["owner-1", new Set(["a"])]]),
		dailyTopicOnWeeklyScanIds: new Set(),
		budgetExhaustedOwnerIds: new Set(),
	})
	expect(sentQueries.filter((sentQuery) => sentQuery.text.includes('from "users"'))).toHaveLength(1)
})
