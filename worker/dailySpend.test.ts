// daily spend tests: the four reads behind the day's spend, the gauge line, the threshold warning, and a failed read
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { restoreConnectionPool, stubConnectionPool } from "../db/connectionPoolStub"
import { readDailySpend, reportDailySpend } from "./dailySpend"

// put the pool and every spy back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// the spend sums each table since the start of the UTC day and counts the day's signups
test("readDailySpend sums the day's scan, chat, and episode costs and counts the day's signups", async () => {
	// each table answers its own sum, and the users table its count, as the array rows a select reads
	const rowsByTable: Record<string, string[][]> = {
		scans: [["1.5"]],
		chat_turns: [["0.25"]],
		episodes: [["2"]],
	}
	const sentQueries = stubConnectionPool(({ text }) => {
		const table = Object.keys(rowsByTable).find((name) => text.includes(`"${name}"`))
		return (table && rowsByTable[table]) || [["7"]]
	})

	// the sums add up, and the signups are counted
	const now = new Date("2026-10-11T15:30:00Z")
	expect(await readDailySpend(now)).toEqual({
		scanDollars: 1.5,
		chatDollars: 0.25,
		podcastEpisodeDollars: 2,
		totalDollars: 3.75,
		newUserCount: 7,
	})

	// every read starts at midnight UTC, which the driver sends as its ISO text
	expect(sentQueries).toHaveLength(4)
	for (const sentQuery of sentQueries) {
		expect(sentQuery.values).toEqual(["2026-10-11T00:00:00.000Z"])
	}
})

// the report logs one gauge line and warns only past the threshold, which an unset threshold never reaches
test("reportDailySpend logs the spend and warns only past the threshold", async () => {
	const logSpy = spyOn(console, "log").mockImplementation(() => {})
	const reportThresholdCrossingSpy = spyOn(monitoring, "reportThresholdCrossing").mockReturnValue(true)
	const dailySpend = { scanDollars: 1, chatDollars: 0, podcastEpisodeDollars: 0, totalDollars: 1, newUserCount: 0 }
	expect(await reportDailySpend(async () => dailySpend)).toEqual(dailySpend)
	expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ gauges: "daily-spend", ...dailySpend }))
	expect(reportThresholdCrossingSpy).not.toHaveBeenCalled()
})

// a read that throws an error is reported, and the report returns null instead of failing the sweep
test("reportDailySpend reports a failed read and returns null", async () => {
	spyOn(console, "error").mockImplementation(() => {})
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	expect(
		await reportDailySpend(async () => {
			throw new Error("database down")
		}),
	).toBeNull()
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
})
