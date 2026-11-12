// daily spend tests: the reads behind the day's spend, the gauge line, the threshold warning, a failed read, and the
// hourly signup alert
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as monitoring from "@carlnotes/server/monitoring"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { loadDailySpend, loadHourlySignups, reportDailySpend } from "./dailySpend"

// a past hour of twelve signups against the default threshold of fifty
const QUIET_HOURLY_SIGNUPS = { hourlySignupCount: 12, hourlySignupAlertCount: 50 }

// a day's spend of one dollar from scans
const ONE_DOLLAR_DAILY_SPEND = {
	scanDollars: 1,
	chatDollars: 0,
	podcastEpisodeDollars: 0,
	personalSourcesDollars: 0,
	topicImageDollars: 0,
	totalDollars: 1,
	newUserCount: 0,
}

// put the pool and every spy back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	restoreRedisClient()
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
	const dailySpend = ONE_DOLLAR_DAILY_SPEND
	expect(
		await reportDailySpend({ loadSpend: async () => dailySpend, loadSignups: async () => QUIET_HOURLY_SIGNUPS }),
	).toEqual(dailySpend)
	expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ gauges: "daily-spend", ...dailySpend }))
	expect(reportThresholdCrossingSpy).not.toHaveBeenCalled()
})

// a read that throws an error is reported, and the report returns null instead of failing the sweep
test("reportDailySpend reports a failed read and returns null", async () => {
	const reportErrorSpy = quietErrorReports()
	expect(
		await reportDailySpend({
			loadSpend: async () => {
				throw new Error("database down")
			},
			loadSignups: async () => QUIET_HOURLY_SIGNUPS,
		}),
	).toBeNull()
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
})

// sixty-four signups in the hour cross the default threshold of fifty, and twelve do not
test("sixty-four signups in the hour cross the default threshold, and twelve do not", async () => {
	spyOn(console, "log").mockImplementation(() => {})
	const reportThresholdCrossingSpy = spyOn(monitoring, "reportThresholdCrossing").mockReturnValue(true)

	// twelve signups send nothing
	await reportDailySpend({
		loadSpend: async () => ONE_DOLLAR_DAILY_SPEND,
		loadSignups: async () => QUIET_HOURLY_SIGNUPS,
	})
	expect(reportThresholdCrossingSpy).not.toHaveBeenCalled()

	// sixty-four signups send the hourly signups warning with the count and the threshold
	const busyHourlySignups = { hourlySignupCount: 64, hourlySignupAlertCount: 50 }
	await reportDailySpend({ loadSpend: async () => ONE_DOLLAR_DAILY_SPEND, loadSignups: async () => busyHourlySignups })
	expect(reportThresholdCrossingSpy.mock.calls).toEqual([
		[
			{
				condition: "hourly-signups",
				message: "the past hour's signups passed the alert threshold",
				values: busyHourlySignups,
			},
		],
	])
})

// a failed signup count is reported, and the day's spend is still logged and returned
test("a failed signup count is reported without stopping the spend report", async () => {
	const logSpy = spyOn(console, "log").mockImplementation(() => {})
	const reportErrorSpy = quietErrorReports()
	const dailySpend = await reportDailySpend({
		loadSpend: async () => ONE_DOLLAR_DAILY_SPEND,
		loadSignups: async () => {
			throw new Error("database down")
		},
	})
	expect(dailySpend).toEqual(ONE_DOLLAR_DAILY_SPEND)
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ gauges: "daily-spend", ...ONE_DOLLAR_DAILY_SPEND }))
})

// the signup count reads the past hour, and an empty settings table alerts at the default threshold
test("loadHourlySignups counts the past hour's signups against the default threshold", async () => {
	// the count returns 64, the empty settings table returns no row, and Redis is empty
	stubRedisClient()
	const sentQueries = stubConnectionPool(({ text }) => (text.includes('from "users"') ? [["64"]] : []))
	const now = new Date("2026-11-10T15:30:00Z")
	expect(await loadHourlySignups(now)).toEqual({ hourlySignupCount: 64, hourlySignupAlertCount: 50 })

	// the count starts an hour before now
	const signupCountQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('select count(*) from "users"'))
	expect(signupCountQuery?.values).toEqual(["2026-11-10T14:30:00.000Z"])
})

// the signup threshold reads the settings alone, so a failed free-plan spend read keeps an override
test("loadHourlySignups keeps an overridden threshold when the free-plan spend read fails", async () => {
	// the count answers 12, the settings row overrides the threshold to 10, and any spend sum fails
	stubRedisClient()
	stubConnectionPool(({ text }) => {
		if (text.includes("coalesce(sum(")) {
			throw new Error("spend read failed")
		}

		// the settings row, then the signup count for any other read
		if (text.includes('from "spend_control_settings"')) {
			return [[null, null, null, null, 10, false]]
		}
		return text.includes('from "users"') ? [["12"]] : []
	})

	// the override survives the failed spend read
	expect(await loadHourlySignups(new Date("2026-11-10T15:30:00Z"))).toEqual({
		hourlySignupCount: 12,
		hourlySignupAlertCount: 10,
	})
})
