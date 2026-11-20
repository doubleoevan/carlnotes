// daily spend cutoff tests: each cutoff at its amount, the defaults and overrides, the switches a stored or cached value
// lacks, the cached and unavailable state, whose chat the unverified accounts switch rejects, and who is past the
// podcast episodes cutoff
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@carlnotes/server/monitoring"
import {
	FREE_USER_ACCESS_ROW,
	PLUS_USER_ACCESS_ROW,
	restoreConnectionPool,
	stubConnectionPool,
} from "./connectionPoolStub"
import {
	type DailySpendCutoffState,
	defaultSpendControlSettings,
	isDailySpendCutoffPassed,
	isUnverifiedAccountLimited,
	isUserPastDailySpendCutoff,
	loadDailySpendCutoffState,
	loadSpendControlSettings,
	toFirstScanDispatchLimit,
	toFreePlanSpendKey,
	toSpendControlSettings,
} from "./dailySpendCutoffs"
import {
	DEFAULT_SPEND_CONTROL_SETTINGS,
	EMPTY_OVERRIDES_ROW,
	SPEND_CONTROL_ENV_NAMES,
	stubCutoffQueries,
	toDailySpendCutoffState,
	UNVERIFIED_SWITCH_ON_ROW,
} from "./dailySpendCutoffTestFixtures"
import { restoreRedisClient, stubRedisClient } from "./redisClientStub"

// each test reads through an empty in-memory Redis with no Doppler value set
beforeEach(() => {
	stubRedisClient()
	for (const envName of SPEND_CONTROL_ENV_NAMES) {
		delete Bun.env[envName]
	}
})

// put both stores and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
})

// each cutoff passes if the day's free-plan spend reaches its amount
test("each cutoff passes at its amount and not a cent below it", () => {
	expect(isDailySpendCutoffPassed(toDailySpendCutoffState(6499), "podcastEpisodes")).toBe(false)
	expect(isDailySpendCutoffPassed(toDailySpendCutoffState(6500), "podcastEpisodes")).toBe(true)
	expect(isDailySpendCutoffPassed(toDailySpendCutoffState(6500), "scheduledScans")).toBe(false)
	expect(isDailySpendCutoffPassed(toDailySpendCutoffState(10_000), "scheduledScans")).toBe(true)
	expect(isDailySpendCutoffPassed(toDailySpendCutoffState(14_999), "chat")).toBe(false)
	expect(isDailySpendCutoffPassed(toDailySpendCutoffState(15_000), "chat")).toBe(true)
})

// a failed read passes no cutoff, and its dispatch limit is zero
test("an unavailable state passes no cutoff and starts no waiting scan", () => {
	const unavailableState: DailySpendCutoffState = { status: "unavailable" }
	expect(isDailySpendCutoffPassed(unavailableState, "podcastEpisodes")).toBe(false)
	expect(isDailySpendCutoffPassed(unavailableState, "scheduledScans")).toBe(false)
	expect(isDailySpendCutoffPassed(unavailableState, "chat")).toBe(false)
	expect(toFirstScanDispatchLimit(unavailableState)).toBe(0)
})

// a stored override wins over its default, and a null override reads as the default
test("an override replaces a default, and clearing it returns the default", () => {
	// an override for the scheduled scans cutoff and the limit, and none for the rest
	const overriddenSettings = toSpendControlSettings({
		podcastEpisodesCutoffCents: null,
		scheduledScansCutoffCents: 7500,
		chatCutoffCents: 20_000,
		firstScanDispatchLimit: 0,
		hourlySignupAlertCount: null,
		isUnverifiedFirstScanLimitOn: true,
	})
	expect(overriddenSettings).toEqual({
		...DEFAULT_SPEND_CONTROL_SETTINGS,
		scheduledScansCutoffCents: 7500,
		chatCutoffCents: 20_000,
		firstScanDispatchLimit: 0,
		isUnverifiedFirstScanLimitOn: true,
	})

	// every cleared override reads as its default
	const clearedSettings = toSpendControlSettings({
		podcastEpisodesCutoffCents: null,
		scheduledScansCutoffCents: null,
		chatCutoffCents: null,
		firstScanDispatchLimit: null,
		hourlySignupAlertCount: null,
		isUnverifiedFirstScanLimitOn: false,
	})
	expect(clearedSettings).toEqual(DEFAULT_SPEND_CONTROL_SETTINGS)
})

// a valid Doppler value moves a default, and any other value reads as the built-in default
test("a Doppler value sets a default, and an invalid or empty one reads as the built-in default", () => {
	// valid values move each default
	Bun.env.PODCAST_EPISODES_DAILY_SPEND_CUTOFF_USD = "40.5"
	Bun.env.SCHEDULED_SCANS_DAILY_SPEND_CUTOFF_USD = "120"
	Bun.env.CHAT_DAILY_SPEND_CUTOFF_USD = "175.25"
	Bun.env.FIRST_SCAN_DISPATCH_LIMIT = "0"
	Bun.env.HOURLY_SIGNUP_ALERT_COUNT = "200"
	expect(defaultSpendControlSettings()).toEqual({
		...DEFAULT_SPEND_CONTROL_SETTINGS,
		podcastEpisodesCutoffCents: 4050,
		scheduledScansCutoffCents: 12_000,
		chatCutoffCents: 17_525,
		firstScanDispatchLimit: 0,
		hourlySignupAlertCount: 200,
	})

	// empty, zero, negative, and non-numeric values read as the built-in defaults
	Bun.env.PODCAST_EPISODES_DAILY_SPEND_CUTOFF_USD = ""
	Bun.env.SCHEDULED_SCANS_DAILY_SPEND_CUTOFF_USD = "0"
	Bun.env.CHAT_DAILY_SPEND_CUTOFF_USD = "-3"
	Bun.env.FIRST_SCAN_DISPATCH_LIMIT = "-1"
	Bun.env.HOURLY_SIGNUP_ALERT_COUNT = "lots"
	expect(defaultSpendControlSettings()).toEqual(DEFAULT_SPEND_CONTROL_SETTINGS)
})

// each UTC day's free-plan spend is cached under its own key
test("the free-plan spend key changes when the UTC day turns", () => {
	expect(toFreePlanSpendKey(new Date("2026-11-10T23:59:59Z"))).toBe("free-plan-spend:2026-11-10")
	expect(toFreePlanSpendKey(new Date("2026-11-11T00:00:00Z"))).toBe("free-plan-spend:2026-11-11")
})

// the first read sums the spend and reads the overrides, and a read within the minute uses the cache
test("the cutoff state reads the free-plan spend and the overrides, then reads them from the cache", async () => {
	// 70 dollars of free scans and an overridden scheduled scans cutoff of 60 dollars
	const sentQueries = stubCutoffQueries({ scanSpendDollars: "70", overridesRow: [null, 6000, null, null, null, false] })
	const cutoffState = await loadDailySpendCutoffState(new Date("2026-11-10T12:00:00Z"))
	expect(cutoffState).toEqual(toDailySpendCutoffState(7000, { scheduledScansCutoffCents: 6000 }))
	expect(isDailySpendCutoffPassed(cutoffState, "scheduledScans")).toBe(true)

	// a second read within the minute sends no query
	const firstReadQueryCount = sentQueries.length
	await loadDailySpendCutoffState(new Date("2026-11-10T12:00:30Z"))
	expect(sentQueries).toHaveLength(firstReadQueryCount)
})

// the first read after midnight sums the new day's spend instead of reading the cached day
test("a new UTC day reads the free-plan spend fresh", async () => {
	// read the day's spend once before midnight
	const sentQueries = stubCutoffQueries({ scanSpendDollars: "150" })
	await loadDailySpendCutoffState(new Date("2026-11-10T23:59:50Z"))
	const spendSumCount = (): number => sentQueries.filter(({ text }) => text.includes("coalesce(sum(")).length
	expect(spendSumCount()).toBe(8)

	// the first read after midnight sums the new day
	await loadDailySpendCutoffState(new Date("2026-11-11T00:00:05Z"))
	expect(spendSumCount()).toBe(16)
})

// a failed spend read returns the unavailable state, reported once and never stored
test("a failed spend read leaves both cutoffs unpassed, reports once, and is not cached", async () => {
	// every spend sum fails, while the overrides read
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const storedValueByKey = stubRedisClient()
	stubConnectionPool(({ text }) => {
		if (text.includes("coalesce(sum(")) {
			throw new Error("database unreachable")
		}
		return [EMPTY_OVERRIDES_ROW]
	})

	// the state is unavailable, the failure is reported once, and no spend is stored
	const cutoffState = await loadDailySpendCutoffState(new Date("2026-11-10T12:00:00Z"))
	expect(cutoffState).toEqual({ status: "unavailable" })
	expect(isDailySpendCutoffPassed(cutoffState, "scheduledScans")).toBe(false)
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(storedValueByKey.has("free-plan-spend:2026-11-10")).toBe(false)
})

// a failed settings read returns the unavailable state, and the overrides are never stored
test("a failed settings read leaves both cutoffs unpassed and is not cached", async () => {
	// the overrides read fails, while 500 dollars of free spend reads
	spyOn(monitoring, "reportError").mockImplementation(() => {})
	const storedValueByKey = stubRedisClient()
	stubConnectionPool(({ text }) => {
		if (text.includes('from "spend_control_settings"')) {
			throw new Error("database unreachable")
		}
		return [[text.includes('from "scans"') ? "500" : "0"]]
	})

	// the state is unavailable, and no overrides are stored
	expect(await loadDailySpendCutoffState(new Date("2026-11-10T12:00:00Z"))).toEqual({ status: "unavailable" })
	expect(storedValueByKey.has("spend-control-settings:v2")).toBe(false)
})

// the switch rejects the chat and voice of a free unverified password account alone
test("the unverified accounts switch limits a free unverified password account, and nobody else", async () => {
	// the switch on, for a free unverified password account
	stubCutoffQueries({ overridesRow: UNVERIFIED_SWITCH_ON_ROW, isUnverifiedPasswordUser: true })
	expect(await isUnverifiedAccountLimited("user-1")).toBe(true)

	// an account that verified or signed in with a provider
	restoreConnectionPool()
	stubCutoffQueries({ overridesRow: UNVERIFIED_SWITCH_ON_ROW, isUnverifiedPasswordUser: false })
	expect(await isUnverifiedAccountLimited("user-1")).toBe(false)

	// a paid unverified password account, which reads only its access row
	restoreConnectionPool()
	const paidUserQueries = stubCutoffQueries({
		accessRow: PLUS_USER_ACCESS_ROW,
		overridesRow: UNVERIFIED_SWITCH_ON_ROW,
		isUnverifiedPasswordUser: true,
	})
	expect(await isUnverifiedAccountLimited("user-1")).toBe(false)
	expect(paidUserQueries).toHaveLength(1)

	// the switch off, for a free unverified password account
	restoreConnectionPool()
	stubRedisClient()
	stubCutoffQueries({ isUnverifiedPasswordUser: true })
	expect(await isUnverifiedAccountLimited("user-1")).toBe(false)
})

// a stored row turns each switch on and overrides the image limit, and an empty table leaves every one off
test("the settings read each stored switch and image limit, and an empty table reads every one as off", async () => {
	// an empty table reads the defaults
	stubCutoffQueries({})
	expect(await loadSpendControlSettings()).toEqual(DEFAULT_SPEND_CONTROL_SETTINGS)

	// a row with both pauses and the featured-only home on, and an image limit of zero
	restoreConnectionPool()
	stubRedisClient()
	stubCutoffQueries({ overridesRow: [null, null, null, null, null, false, 0, true, true, true] })
	expect(await loadSpendControlSettings()).toEqual({
		...DEFAULT_SPEND_CONTROL_SETTINGS,
		generatedChapterImageLimit: 0,
		isPodcastEpisodeRecordingPaused: true,
		isTopicVideoRenderingPaused: true,
		isHomeFeaturedOnly: true,
	})
})

// a cached value that a replica wrote before the newer settings existed turns nothing on
test("overrides that lack the newer settings read every switch as off and the image limit as its default", () => {
	const olderOverrides = {
		podcastEpisodesCutoffCents: null,
		scheduledScansCutoffCents: 7_500,
		chatCutoffCents: null,
		firstScanDispatchLimit: null,
		hourlySignupAlertCount: null,
		isUnverifiedFirstScanLimitOn: false,
	}
	expect(toSpendControlSettings(olderOverrides)).toEqual({
		...DEFAULT_SPEND_CONTROL_SETTINGS,
		scheduledScansCutoffCents: 7_500,
	})
})

// a failed settings read reports itself and reads every switch as off
test("a failed settings read reads every switch as off and is reported", async () => {
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	stubConnectionPool(({ text }) => {
		if (text.includes('from "spend_control_settings"')) {
			throw new Error("database unreachable")
		}
		return []
	})

	// every setting reads its default, and the one failure is reported
	expect(await loadSpendControlSettings()).toEqual(DEFAULT_SPEND_CONTROL_SETTINGS)
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
})

// the podcast episodes cutoff applies only to a free user, and an unavailable state passes it for no one
test("a free user is past the podcast episodes cutoff at its amount, and a paid user or an unavailable state never is", async () => {
	// a free user at the podcast episodes cutoff
	stubCutoffQueries({ scanSpendDollars: "65" })
	expect(await isUserPastDailySpendCutoff("user-1", "podcastEpisodes")).toBe(true)

	// a paid user at the same spend reads only the access row
	restoreConnectionPool()
	const sentQueries = stubCutoffQueries({ accessRow: PLUS_USER_ACCESS_ROW, scanSpendDollars: "65" })
	expect(await isUserPastDailySpendCutoff("user-1", "podcastEpisodes")).toBe(false)
	expect(sentQueries).toHaveLength(1)

	// a free user whose spend read fails, with a fresh cache, is not past it
	restoreConnectionPool()
	stubRedisClient()
	spyOn(monitoring, "reportError").mockImplementation(() => {})

	// fail only the spend sums
	stubConnectionPool(({ text }) => {
		if (text.includes("coalesce(sum(")) {
			throw new Error("database unreachable")
		}
		return text.includes('from "spend_control_settings"') ? [EMPTY_OVERRIDES_ROW] : [FREE_USER_ACCESS_ROW]
	})

	// the failed read passes nothing
	expect(await isUserPastDailySpendCutoff("user-1", "podcastEpisodes")).toBe(false)
})
