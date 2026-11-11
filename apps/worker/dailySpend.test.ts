// daily spend tests: the reads behind the day's spend, the gauge line, the threshold warning, and a failed read
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as monitoring from "@carlnotes/server/monitoring"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { loadDailySpend, reportDailySpend } from "./dailySpend"

// put the pool and every spy back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// the spend sums each table since the start of the UTC day and counts the day's signups
test("loadDailySpend sums the day's scan, chat, podcast episode, and film costs and counts the day's signups", async () => {
	// each table answers its own sum, and the users table its count, as the array rows a select reads. the film sum
	// comes first. its query names the episodes table too
	const rowsByTable: Record<string, string[][]> = {
		topic_podcast_episode_videos: [["0.5"]],
		scans: [["1.5"]],
		chat_turns: [["0.25"]],
		episodes: [["2"]],
		personal_source_distillation_spends: [["0.15"]],
		topic_image_renders: [["0"]],
		// a discussion's cost counts with the podcast episodes'
		topic_post_discussions: [["0.5"]],
	}
	const sentQueries = stubConnectionPool(({ text }) => {
		const table = Object.keys(rowsByTable).find((name) => text.includes(`"${name}"`))
		return (table && rowsByTable[table]) || [["7"]]
	})

	// the sums add up, with the films and the discussions counted among the podcast episodes, and the signups are
	// counted
	const now = new Date("2026-10-11T15:30:00Z")
	expect(await loadDailySpend(now)).toEqual({
		scanDollars: 1.5,
		chatDollars: 0.25,
		podcastEpisodeDollars: 3,
		personalSourcesDollars: 0.15,
		topicImageDollars: 0,
		totalDollars: 4.9,
		newUserCount: 7,
	})

	// every read starts at midnight UTC, which the driver sends as its ISO text
	expect(sentQueries).toHaveLength(8)
	for (const sentQuery of sentQueries) {
		expect(sentQuery.values).toEqual(["2026-10-11T00:00:00.000Z"])
	}
})

// the report logs one gauge line and warns only past the threshold, which an unset threshold never reaches
test("reportDailySpend logs the spend and warns only past the threshold", async () => {
	const logSpy = spyOn(console, "log").mockImplementation(() => {})
	const reportThresholdCrossingSpy = spyOn(monitoring, "reportThresholdCrossing").mockReturnValue(true)
	const dailySpend = {
		scanDollars: 1,
		chatDollars: 0,
		podcastEpisodeDollars: 0,
		personalSourcesDollars: 0,
		topicImageDollars: 0,
		totalDollars: 1,
		newUserCount: 0,
	}
	expect(await reportDailySpend(async () => dailySpend)).toEqual(dailySpend)
	expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ gauges: "daily-spend", ...dailySpend }))
	expect(reportThresholdCrossingSpy).not.toHaveBeenCalled()
})

// a read that throws an error is reported, and the report returns null instead of failing the sweep
test("reportDailySpend reports a failed read and returns null", async () => {
	const reportErrorSpy = quietErrorReports()
	expect(
		await reportDailySpend(async () => {
			throw new Error("database down")
		}),
	).toBeNull()
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
})
