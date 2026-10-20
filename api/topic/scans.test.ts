// manual scan tests: a scan with a spent monthly budget, one past the manual scans cutoff, and one whose key has spent
// its budget are rejected before anything starts or is billed. a failed budget read starts the scan, and an admin's
// scan checks the admin's own budget
import { afterEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import { quietErrorReports } from "@shared/monitoringTestFixtures"
import { MANUAL_SCAN_PAUSED_LABEL, SCAN_SPENT_BUDGET_LABEL } from "@shared/scanFailure"
import { stubConnectionPool, toTableRow } from "../../db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "../../db/monthlyBudgetCutoffs"
import { topics } from "../../db/schema/topics"
import * as litellm from "../../worker/litellm"
import { restoreLiteLLMTest, setUpLiteLLMTest } from "../../worker/litellmTestFixtures"
import * as scan from "../../worker/scan"
import * as staleScans from "../../worker/staleScans"
import * as authorization from "../authorization"
import * as billing from "../billing"
import { toSignedInApp } from "../testSession"
import { scansRoute } from "./scans"

// put the connection pool's own query, the real fetch, the proxy settings, and the spies back after each test
afterEach(() => {
	restoreLiteLLMTest()
})

// stub the connection pool to return one topic owned by owner-1, and a user whose key is sk-user
function stubOwnedTopicRows(): void {
	// the topic row, with only its id and owner set
	const topicRow = toTableRow(topics, { id: "topic-1", ownerId: "owner-1" })

	// return the topic row for the topic select
	stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [topicRow]
		}

		// return a user row for the user select that the budget read makes, and no rows for any other query
		return text.includes('from "users"') ? [["owner@example.com", "sk-user", "user", "free", null]] : []
	})
}

// the spies on the scan start, the stale scan close-out, and the overage bill
type ManualScanSpies = {
	startTopicScanSpy: Mock<typeof scan.startTopicScan>
	failStaleScansSpy: Mock<typeof staleScans.failStaleScans>
	reportManualScanOverageSpy: Mock<typeof billing.reportManualScanOverage>
}

// stub the gate to allow the scan, the user's spend to be under the whole budget and the manual scans cutoff, and the
// scan load to return no scan. spy on the scan start, the stale scan close-out, and the overage bill
function spyOnManualScan(isOverage: boolean): ManualScanSpies {
	spyOn(authorization, "loadManualScanAuthorization").mockResolvedValue({
		status: "allowed",
		remainingScans: 2,
		isOverage,
	})
	spyOn(authorization, "isMonthlySpendExhausted").mockResolvedValue(false)
	spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(false)
	spyOn(scan, "loadScan").mockResolvedValue(undefined)
	return {
		startTopicScanSpy: spyOn(scan, "startTopicScan").mockResolvedValue({
			status: "started",
			scan: { id: "scan-1" } as never,
			whenFinished: async () => {},
		}),
		failStaleScansSpy: spyOn(staleScans, "failStaleScans").mockResolvedValue(0),
		reportManualScanOverageSpy: spyOn(billing, "reportManualScanOverage").mockResolvedValue(undefined),
	}
}

// set the proxy settings that the budget read needs, swap fetch for a proxy that cannot be reached, and return the stub
function stubUnreachableProxy(): Mock<() => Promise<Response>> {
	setUpLiteLLMTest()
	const fetchMock = mock(async (): Promise<Response> => {
		throw new TypeError("fetch failed")
	})
	globalThis.fetch = fetchMock as unknown as typeof fetch
	return fetchMock
}

// request a manual scan of topic-1 as the given user
async function sendManualScan(userId: string): Promise<Response> {
	return toSignedInApp(scansRoute, userId).request("/topics/topic-1/scan", { method: "POST" })
}

// a spent budget rejects the scan with the budget label, before the stale scan close-out, the scan row, or the overage
test("a manual Scan whose key has spent its budget returns 402 with the budget label and starts nothing", async () => {
	// an owner past the daily limit with a card on file, whose key has spent its budget
	stubOwnedTopicRows()
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

// a spend past the manual scans cutoff rejects the scan with the paused label, before the key is read or anything starts
test("a manual Scan past the manual scans cutoff returns 402 with the paused label and starts nothing", async () => {
	// an owner whose spend is past the cutoff and under the whole budget
	stubOwnedTopicRows()
	const { startTopicScanSpy, reportManualScanOverageSpy } = spyOnManualScan(true)
	const isMonthlyBudgetCutoffPassedSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(
		true,
	)
	const isUserLiteLLMKeyBudgetExhaustedSpy = spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted")

	// the scan is rejected with the paused label, and nothing was read from the key, started, or billed
	const response = await sendManualScan("owner-1")
	expect(response.status).toBe(402)
	expect(await response.json()).toEqual({ error: MANUAL_SCAN_PAUSED_LABEL })
	expect(isMonthlyBudgetCutoffPassedSpy).toHaveBeenCalledWith("owner-1", "manualScans")
	expect(isUserLiteLLMKeyBudgetExhaustedSpy).not.toHaveBeenCalled()
	expect(startTopicScanSpy).not.toHaveBeenCalled()
	expect(reportManualScanOverageSpy).not.toHaveBeenCalled()
})

// a spent monthly budget stops scheduled scans too, so it rejects the scan with the budget label, never the paused one
test("a manual Scan with a spent monthly budget returns 402 with the budget label and starts nothing", async () => {
	// an owner whose spend is at the whole budget, which is past the manual scans cutoff too
	stubOwnedTopicRows()
	const { startTopicScanSpy, failStaleScansSpy, reportManualScanOverageSpy } = spyOnManualScan(true)
	const isMonthlySpendExhaustedSpy = spyOn(authorization, "isMonthlySpendExhausted").mockResolvedValue(true)
	spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(true)
	const isUserLiteLLMKeyBudgetExhaustedSpy = spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted")

	// the scan is rejected with the budget label, read from the owner's spend before the key
	const response = await sendManualScan("owner-1")
	expect(response.status).toBe(402)
	expect(await response.json()).toEqual({ error: SCAN_SPENT_BUDGET_LABEL })
	expect(isMonthlySpendExhaustedSpy).toHaveBeenCalledWith("owner-1")
	expect(isUserLiteLLMKeyBudgetExhaustedSpy).not.toHaveBeenCalled()

	// nothing was closed out, started, or billed
	expect(failStaleScansSpy).not.toHaveBeenCalled()
	expect(startTopicScanSpy).not.toHaveBeenCalled()
	expect(reportManualScanOverageSpy).not.toHaveBeenCalled()
})

// a budget read that fails starts the scan
test("a failed budget read starts the manual Scan", async () => {
	// an owner with a key, and a proxy that cannot be reached
	stubOwnedTopicRows()
	const { startTopicScanSpy } = spyOnManualScan(false)
	const fetchMock = stubUnreachableProxy()

	// the budget read called the proxy once, and the scan starts on the owner's key
	const response = await sendManualScan("owner-1")
	expect(fetchMock).toHaveBeenCalledTimes(1)
	expect(response.status).toBe(200)
	expect(startTopicScanSpy).toHaveBeenCalledWith("topic-1", "owner-1", "manual")
})

// an admin's scan bills the admin's own key, so the budget check reads the admin's budget
test("an admin's manual Scan checks the admin's own budget", async () => {
	// the topic owner's budget is spent, and the admin's is not
	stubOwnedTopicRows()
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

// a start that throws, such as a Temporal that cannot be reached, is reported and responds as unavailable, never a 500
test("a manual Scan whose start throws is reported and responds 503", async () => {
	// an owner with a key and a start that throws, with the console and the error report quiet
	stubOwnedTopicRows()
	const { startTopicScanSpy } = spyOnManualScan(false)
	startTopicScanSpy.mockRejectedValue(new Error("temporal is not reachable"))
	const reportErrorSpy = quietErrorReports()

	// a proxy that cannot be reached, so the budget read fails and the scan goes ahead to the start
	stubUnreachableProxy()

	// the scan responds as unavailable, and the failed start is reported with the topic and the user
	const response = await sendManualScan("owner-1")
	expect(response.status).toBe(503)
	expect(await response.json()).toEqual({ error: "scanning is temporarily unavailable, try again in a minute" })
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "manual-scan", {
		topicId: "topic-1",
		userId: "owner-1",
	})
})
