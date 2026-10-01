// manual scan tests: a scan whose key has spent its budget is rejected before anything starts or is billed.
// a failed budget read starts the scan, and an admin's scan checks the admin's own budget
import { afterEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import { SCAN_SPENT_BUDGET_LABEL } from "@shared/scanFailure"
import { getTableColumns } from "drizzle-orm"
import { Hono } from "hono"
import { connectionPool } from "../../db"
import { topics } from "../../db/schema"
import * as litellm from "../../worker/litellm"
import * as scan from "../../worker/scan"
import * as schedule from "../../worker/schedule"
import * as authorization from "../authorization"
import * as billing from "../billing"
import type { AppEnv } from "../currentUser"
import { scansRoute } from "./scans"

// the connection pool's own query, the real fetch, and the proxy settings that the budget read needs,
// put back after each test along with the spies
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

// stub the connection pool to return one topic owned by owner-1, and a user whose key is sk-user
function stubConnectionPool(): void {
	// the topic row, with only its id and owner set
	const topicValues: Record<string, string> = { id: "topic-1", ownerId: "owner-1" }
	const topicRow = Object.keys(getTableColumns(topics)).map((columnName) => topicValues[columnName] ?? null)

	// return the topic row for the topic select
	connectionPool.query = ((queryConfig: { text: string }) => {
		if (queryConfig.text.includes('from "topics"')) {
			return Promise.resolve({ rows: [topicRow], fields: [], rowCount: 1 })
		}

		// return a user row for the user select that the budget read makes, and no rows for any other query
		const userRows = queryConfig.text.includes('from "users"')
			? [["owner@example.com", "sk-user", "user", "free", null]]
			: []
		return Promise.resolve({ rows: userRows, fields: [], rowCount: userRows.length })
	}) as unknown as typeof connectionPool.query
}

// the spies on the scan start, the stale scan close-out, and the overage bill
type ManualScanSpies = {
	startTopicScanSpy: Mock<typeof scan.startTopicScan>
	failStaleScansSpy: Mock<typeof schedule.failStaleScans>
	reportManualScanOverageSpy: Mock<typeof billing.reportManualScanOverage>
}

// stub the gate to allow the scan, and stub the scan load to return no scan.
// spy on the scan start, the stale scan close-out, and the overage bill
function spyOnManualScan(isOverage: boolean): ManualScanSpies {
	spyOn(authorization, "loadManualScanAuthorization").mockResolvedValue({
		status: "allowed",
		remainingScans: 2,
		isOverage,
	})
	spyOn(scan, "loadScan").mockResolvedValue(undefined)
	return {
		startTopicScanSpy: spyOn(scan, "startTopicScan").mockResolvedValue({
			status: "started",
			scan: { id: "scan-1" } as never,
			whenFinished: async () => {},
		}),
		failStaleScansSpy: spyOn(schedule, "failStaleScans").mockResolvedValue(0),
		reportManualScanOverageSpy: spyOn(billing, "reportManualScanOverage").mockResolvedValue(undefined),
	}
}

// request a manual scan of topic-1 as the given user
async function sendManualScan(userId: string): Promise<Response> {
	// the scan routes with the given user signed in
	const app = new Hono<AppEnv>()
		.use(async (context, next) => {
			context.set("user", { id: userId } as never)
			await next()
		})
		.route("/", scansRoute)
	return app.request("/topics/topic-1/scan", { method: "POST" })
}

// a spent budget rejects the scan with the budget label, before the stale scan close-out, the scan row, or the overage
test("a manual Scan whose key has spent its budget returns 402 with the budget label and starts nothing", async () => {
	// an owner past the daily limit with a card on file, whose key has spent its budget
	stubConnectionPool()
	const { startTopicScanSpy, failStaleScansSpy, reportManualScanOverageSpy } = spyOnManualScan(true)
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(true)

	// the scan is rejected with the budget label
	const response = await sendManualScan("owner-1")
	expect(response.status).toBe(402)
	expect(await response.json()).toEqual({ error: SCAN_SPENT_BUDGET_LABEL })

	// nothing was closed out, started, or billed
	expect(failStaleScansSpy).not.toHaveBeenCalled()
	expect(startTopicScanSpy).not.toHaveBeenCalled()
	expect(reportManualScanOverageSpy).not.toHaveBeenCalled()
})

// a budget read that fails starts the scan
test("a failed budget read starts the manual Scan", async () => {
	// an owner with a key, and the proxy settings that the budget read needs
	stubConnectionPool()
	const { startTopicScanSpy } = spyOnManualScan(false)
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "master"

	// a proxy that cannot be reached
	const fetchMock = mock(async (): Promise<Response> => {
		throw new TypeError("fetch failed")
	})
	globalThis.fetch = fetchMock as unknown as typeof fetch

	// the budget read called the proxy once, and the scan starts on the owner's key
	const response = await sendManualScan("owner-1")
	expect(fetchMock).toHaveBeenCalledTimes(1)
	expect(response.status).toBe(200)
	expect(startTopicScanSpy).toHaveBeenCalledWith("topic-1", "owner-1", "manual")
})

// an admin's scan bills the admin's own key, so the budget check reads the admin's budget
test("an admin's manual Scan checks the admin's own budget", async () => {
	// the topic owner's budget is spent, and the admin's is not
	stubConnectionPool()
	const { startTopicScanSpy } = spyOnManualScan(false)
	const isUserLiteLLMKeyBudgetExhaustedSpy = spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockImplementation(
		async (userId) => userId === "owner-1",
	)

	// the admin's budget is checked, and the scan starts on the admin's key
	const response = await sendManualScan("admin-1")
	expect(response.status).toBe(200)
	expect(isUserLiteLLMKeyBudgetExhaustedSpy).toHaveBeenCalledWith("admin-1")
	expect(startTopicScanSpy).toHaveBeenCalledWith("topic-1", "admin-1", "manual")
})
