// manual scan tests: a scan with a spent monthly budget, one past the manual scans cutoff, and one whose key has spent
// its budget are rejected before anything starts or is billed. a failed budget read starts the scan, and an admin's
// scan checks the admin's own budget. scan note tests: who gets a source result's cost, reason, and full url label, and
// which stored results never leave the api
import { afterEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import { MANUAL_SCAN_PAUSED_LABEL, SCAN_SPENT_BUDGET_LABEL } from "@carlnotes/contracts/scanFailure"
import type { StoredScanSourceResults, StoredSourceResult } from "@carlnotes/contracts/topics"
import {
	ADMIN_USER_ACCESS_ROW,
	FREE_USER_ACCESS_ROW,
	stubConnectionPool,
	toTableRow,
} from "@carlnotes/db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import { topics } from "@carlnotes/db/schema/topics"
import * as litellm from "@carlnotes/models/litellm"
import { restoreLiteLLMTest, setUpLiteLLMTest } from "@carlnotes/models/litellmTestFixtures"
import * as scan from "@carlnotes/pipeline/scan"
import * as staleScans from "@carlnotes/pipeline/staleScans"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import * as authorization from "../authorization"
import * as billing from "../billing"
import { toSignedInApp } from "../testSession"
import { scansRoute, toSourceResultsView } from "./scans"

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

// a url Source with a token in its query that ran, a reddit Source that fell back, an rss feed that failed, and a url
// Source skipped while its page awaited screening
const URL_SOURCE_RESULT: StoredSourceResult = {
	sourceId: "source-url",
	sourceKind: "url",
	label: "https://example.com/report?token=abc",
	foundCount: 1,
	keptCount: 1,
	costDollars: 0,
	durationMs: 1_800,
	status: "ok",
}
const REDDIT_SOURCE_RESULT: StoredSourceResult = {
	sourceId: "source-reddit",
	sourceKind: "reddit",
	label: "r/typescript",
	foundCount: 9,
	keptCount: 2,
	costDollars: 0.004,
	durationMs: 2_400,
	status: "fallback",
	fallbackMode: "reddit-rss",
}
const RSS_SOURCE_RESULT: StoredSourceResult = {
	sourceId: "source-rss",
	sourceKind: "rss",
	label: "example.org",
	foundCount: 0,
	keptCount: 0,
	costDollars: 0,
	durationMs: 300,
	status: "failed",
	reason: "feed returned 404",
}
const SKIPPED_SOURCE_RESULT: StoredSourceResult = {
	sourceId: "source-pending",
	sourceKind: "url",
	label: "https://unscreened.example.com/page",
	foundCount: 0,
	keptCount: 0,
	costDollars: 0,
	durationMs: 0,
	status: "skipped",
}

// a scan's stored results: the four Sources above, and nine findings from earlier scans read again with four kept
const STORED_SOURCE_RESULTS: StoredScanSourceResults = {
	sources: [URL_SOURCE_RESULT, REDDIT_SOURCE_RESULT, RSS_SOURCE_RESULT, SKIPPED_SOURCE_RESULT],
	earlierKeptCount: 4,
	earlierFoundCount: 9,
}

// stub the connection pool to return one scan on a public topic owned by owner-1, with the stored results given, and
// the access row of admin-1 as an admin's and of every other user as a free user's
function stubScanNoteRows(storedSourceResults: unknown): void {
	const topicRow = toTableRow(topics, { id: "topic-1", ownerId: "owner-1", visibility: "public" })
	stubConnectionPool(({ text, values }) => {
		// the scan row with its topic's columns
		if (text.includes('from "scans" inner join "topics"')) {
			return [["Carl's notes", storedSourceResults, ...topicRow]]
		}

		// each user's access row, and no rows for any other query
		if (text.includes('from "users"')) {
			return values.includes("admin-1") ? [ADMIN_USER_ACCESS_ROW] : [FREE_USER_ACCESS_ROW]
		}
		return []
	})
}

// read scan-1's note as the given user, or as a signed-out visitor for null
async function readScanNote(userId: string | null): Promise<unknown> {
	const response = await (userId ? toSignedInApp(scansRoute, userId) : scansRoute).request("/scans/scan-1")
	expect(response.status).toBe(200)
	return response.json()
}

// the owner and an admin see what each Source cost, why one failed, and a url Source's whole url
test("the owner and an admin read every source result's cost, reason, and full label", async () => {
	stubScanNoteRows(STORED_SOURCE_RESULTS)
	const ownerSourceResults = {
		sources: [URL_SOURCE_RESULT, REDDIT_SOURCE_RESULT, RSS_SOURCE_RESULT],
		earlierKeptCount: 4,
		earlierFoundCount: 9,
	}
	expect(await readScanNote("owner-1")).toEqual({ scanSummary: "Carl's notes", sourceResults: ownerSourceResults })
	expect(await readScanNote("admin-1")).toEqual({ scanSummary: "Carl's notes", sourceResults: ownerSourceResults })
})

// a visitor gets the counts, statuses, modes, and times, a url Source by its host, and no cost or reason
test("a signed-out visitor reads no cost or reason and a url Source by its host", async () => {
	stubScanNoteRows(STORED_SOURCE_RESULTS)
	expect(await readScanNote(null)).toEqual({
		scanSummary: "Carl's notes",
		sourceResults: {
			sources: [
				{ ...URL_SOURCE_RESULT, label: "example.com", costDollars: null },
				{ ...REDDIT_SOURCE_RESULT, costDollars: null },
				{ ...RSS_SOURCE_RESULT, costDollars: null, reason: null },
			],
			earlierKeptCount: 4,
			earlierFoundCount: 9,
		},
	})
})

// a skipped Source may be a url not yet screened, and a status the view does not name stays out until it does
test("a skipped result and an unknown stored status never leave the api", () => {
	// the skipped result is left out of the owner's view
	const ownerSourceResultsView = toSourceResultsView(STORED_SOURCE_RESULTS, true)
	expect(ownerSourceResultsView?.sources.map(({ sourceId }) => sourceId)).toEqual([
		"source-url",
		"source-reddit",
		"source-rss",
	])

	// a stored status the stored shape does not name returns no results at all
	const unknownStatusSourceResult = { ...URL_SOURCE_RESULT, status: "throttled" }
	expect(toSourceResultsView({ sources: [unknownStatusSourceResult], earlierKeptCount: 0 }, true)).toBeNull()
})

// the view copies each wire field by name, so a field added to the stored shape is never sent unreviewed. results saved
// before the earlier read count read it as zero
test("an unknown stored field never reaches the response", () => {
	const storedSourceResultWithSecret = { ...REDDIT_SOURCE_RESULT, apiKey: "sk-secret" }
	const sourceResultsView = toSourceResultsView(
		{ sources: [storedSourceResultWithSecret], earlierKeptCount: 0, ownerEmail: "owner@example.com" },
		true,
	)
	expect(sourceResultsView).toEqual({ sources: [REDDIT_SOURCE_RESULT], earlierKeptCount: 0, earlierFoundCount: 0 })
})

// a malformed value shows no chart instead of breaking the note, and a scan from before source results has none
test("a malformed stored value and an older scan both return no results", async () => {
	expect(toSourceResultsView({ sources: "not a list" }, true)).toBeNull()
	stubScanNoteRows(null)
	expect(await readScanNote("owner-1")).toEqual({ scanSummary: "Carl's notes", sourceResults: null })
})
