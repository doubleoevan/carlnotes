// the sweep's report slot: two runs in one hour send one warning, and a Redis that cannot say still sends
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreRedisClient } from "@carlnotes/db/redisClientStub"
import { type FakeRedisServer, startFakeRedisStore } from "@carlnotes/db/redisFakeServer"
import { clearReportHistory, limitReportsBySlot, shutdownMonitoring } from "@carlnotes/server/monitoring"
import { reportDailySpend } from "./dailySpend"
import { takeSweepReportSlot } from "./sweepReportSlots"

// the fake Redis that the runs share, and whether each report the sweep asked about was sent
let fakeRedisServer: FakeRedisServer
let reportSlotAnswers: [reportKey: string, isSent: boolean][]
beforeEach(() => {
	fakeRedisServer = startFakeRedisStore().fakeRedisServer
	reportSlotAnswers = []
	spyOn(console, "log").mockImplementation(() => {})
	spyOn(console, "error").mockImplementation(() => {})
})

// put the store's own clients and the monitoring's own state back after each test
afterEach(() => {
	restoreRedisClient()
	limitReportsBySlot(null)
	clearReportHistory()
	mock.restore()
})

// one cron run of the sweep's last stage, in a process that has reported nothing yet: the past hour's signups are at
// the alert count, the day's spend is under its alert, and each report takes its slot in Redis
async function runSweepSpendReport(): Promise<void> {
	clearReportHistory()
	limitReportsBySlot(async (reportKey) => {
		const isSent = await takeSweepReportSlot(reportKey)
		reportSlotAnswers.push([reportKey, isSent])
		return isSent
	})
	await reportDailySpend({
		loadSpend: async () => ({ totalDollars: 0, newUserCount: 0 }) as never,
		loadSignups: async () => ({ hourlySignupCount: 50, hourlySignupAlertCount: 50 }),
	})
	await shutdownMonitoring()
}

test("two sweep runs in one hour send one hourly-signups warning", async () => {
	await runSweepSpendReport()
	await runSweepSpendReport()

	// both runs crossed the threshold, the first took the hour's slot, and the second found it held
	expect(reportSlotAnswers).toEqual([
		["condition:hourly-signups", true],
		["condition:hourly-signups", false],
	])
	expect([...fakeRedisServer.slotFreesAtByKey.keys()]).toEqual(["sweep-report:condition:hourly-signups"])
})

test("a sweep run still sends its warning while Redis cannot say", async () => {
	// the first run takes the slot, then Redis fails every command
	await runSweepSpendReport()
	fakeRedisServer.isCommandFailing = true
	await runSweepSpendReport()
	expect(reportSlotAnswers).toEqual([
		["condition:hourly-signups", true],
		["condition:hourly-signups", true],
	])
})
