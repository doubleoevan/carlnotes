// schedule tests: a sweep stage that throws, and the sweep without the budget reset
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as jobLease from "@carlnotes/db/jobLease"
import * as adminPlanChanges from "@carlnotes/pipeline/adminPlanChanges"
import * as firecrawlCredit from "@carlnotes/pipeline/firecrawlCredit"
import * as temporalClient from "@carlnotes/pipeline/temporalClient"
import * as uncheckedImageChecks from "@carlnotes/pipeline/uncheckedImageChecks"
import * as monitoring from "@carlnotes/server/monitoring"
import * as dailySpend from "./dailySpend"
import * as notificationsEmails from "./notificationsEmails"
import * as reportReminders from "./reportReminders"
import * as pendingObjectDeletions from "./retryPendingObjectDeletions"
import * as dailyCounts from "./saveDailyCounts"
import { runSweep } from "./schedule"
import * as viewerCounts from "./syncViewerCounts"

// put each spied function and the connection pool's own query back after each test, whether its assertions pass or not
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// one stage's failure is reported, and every stage after it still runs
test("a sweep whose leased stage throws still saves the daily counts and reports the day's spend", async () => {
	// the sweep's own lease cannot be taken, and the viewer count sync's lease runs its task
	spyOn(console, "error").mockImplementation(() => {})
	spyOn(jobLease, "runWithJobLease").mockImplementation(async ({ jobName, runTask }) => {
		if (jobName === "scheduled-scan-sweep") {
			throw new Error("the database is unreachable")
		}
		return runTask(new AbortController().signal)
	})

	// a stage that records its name and does none of its work
	const ranStageNames: string[] = []
	const recordStage = (stageName: string) => async (): Promise<never> => {
		ranStageNames.push(stageName)
		return undefined as never
	}

	// the stages after the leased sweep, each recorded
	spyOn(viewerCounts, "copyViewerCounts").mockImplementation(recordStage("viewer counts"))
	spyOn(dailyCounts, "saveDailyCounts").mockImplementation(recordStage("daily counts"))
	spyOn(pendingObjectDeletions, "retryPendingObjectDeletions").mockImplementation(recordStage("object deletions"))
	spyOn(uncheckedImageChecks, "checkUncheckedImages").mockImplementation(recordStage("unchecked images"))
	spyOn(reportReminders, "remindOpenReports").mockImplementation(recordStage("report reminders"))
	spyOn(adminPlanChanges, "endExpiredAdminPlanChanges").mockImplementation(recordStage("admin plan changes"))

	// the emails throw too, and the two stages after them are recorded
	spyOn(notificationsEmails, "sendNotificationsEmails").mockRejectedValue(new Error("the email read failed"))
	spyOn(temporalClient, "startDashboardSnapshotsWorkflow").mockImplementation(recordStage("dashboard build"))
	spyOn(dailySpend, "reportDailySpend").mockImplementation(recordStage("daily spend"))
	spyOn(firecrawlCredit, "reportFirecrawlCreditSpent").mockImplementation(recordStage("firecrawl credit"))
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const failedStageNames = await runSweep()

	// both failed stages are named and reported under their own stage, and every other stage ran
	expect(failedStageNames).toEqual(["scheduled scans", "notifications emails"])
	expect(
		reportErrorSpy.mock.calls.map(([reportedError, stage, extra]) => [(reportedError as Error).message, stage, extra]),
	).toEqual([
		["the database is unreachable", "scheduled-scan", { sweepStage: "scheduled scans" }],
		["the email read failed", "email", { emailKind: "notifications", sweepStage: "notifications emails" }],
	])
	expect(ranStageNames).toEqual([
		"viewer counts",
		"daily counts",
		"object deletions",
		"unchecked images",
		"report reminders",
		"admin plan changes",
		"dashboard build",
		"daily spend",
		"firecrawl credit",
	])
})

// the monthly budget reset runs as its own daily job, so the sweep's source never names resetMonthlyBudgets
test("the sweep never calls the monthly budget reset", async () => {
	const scheduleSource = await Bun.file(new URL("./schedule.ts", import.meta.url)).text()
	expect(scheduleSource).not.toContain("resetMonthlyBudgets")
})
