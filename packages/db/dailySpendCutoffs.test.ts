// daily spend cutoff tests: each cutoff at its amount, the defaults and overrides, the cached and unavailable state, the
// waiting scan filter, and which first and manual scans wait
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
	isFirstScanWaiting,
	isManualScanWaiting,
	isTopicFirstScanWaiting,
	isUserPastDailySpendCutoff,
	loadDailySpendCutoffState,
	toFirstScanDispatchLimit,
	toFreePlanSpendKey,
	toSpendControlSettings,
	toWaitingScanFilter,
} from "./dailySpendCutoffs"
import { DEFAULT_SPEND_CONTROL_SETTINGS, toDailySpendCutoffState } from "./dailySpendCutoffTestFixtures"
import { db } from "./index"
import { restoreRedisClient, stubRedisClient } from "./redisClientStub"
import { scans } from "./schema/scans"

// the stored overrides row with no override, in the column order the settings read selects
const EMPTY_OVERRIDES_ROW = [null, null, null, null, null, false]

// the five Doppler settings the defaults read
const SPEND_CONTROL_ENV_NAMES = [
	"PODCAST_EPISODES_DAILY_SPEND_CUTOFF_USD",
	"SCHEDULED_SCANS_DAILY_SPEND_CUTOFF_USD",
	"CHAT_DAILY_SPEND_CUTOFF_USD",
	"FIRST_SCAN_DISPATCH_LIMIT",
	"HOURLY_SIGNUP_ALERT_COUNT",
] as const

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

// the rows the stubbed database returns: the access row, the overrides, the day's spend, and the unverified check
type CutoffQueryRows = {
	accessRow?: unknown[]
	overridesRow?: unknown[]
	scanSpendDollars?: string
	isUnverifiedPasswordUser?: boolean
}

// stub the database with the rows each read sends, and return the queries it was sent
function stubCutoffQueries({
	accessRow = FREE_USER_ACCESS_ROW,
	overridesRow = EMPTY_OVERRIDES_ROW,
	scanSpendDollars = "0",
	isUnverifiedPasswordUser = false,
}: CutoffQueryRows): ReturnType<typeof stubConnectionPool> {
	return stubConnectionPool(({ text }) => {
		// the unverified check and the access row both read users, so the unverified check is told apart first
		if (text.includes('"email_verified"')) {
			return isUnverifiedPasswordUser ? [["user-1"]] : []
		}

		// the overrides, and the spend sums with the scan spend given
		if (text.includes('from "spend_control_settings"')) {
			return [overridesRow]
		}
		if (text.includes("coalesce(sum(")) {
			return [[text.includes('from "scans"') ? scanSpendDollars : "0"]]
		}

		// the access row for any other read
		return [accessRow]
	})
}

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
	expect(spendSumCount()).toBe(7)

	// the first read after midnight sums the new day
	await loadDailySpendCutoffState(new Date("2026-11-11T00:00:05Z"))
	expect(spendSumCount()).toBe(14)
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
	expect(storedValueByKey.has("spend-control-settings")).toBe(false)
})

// render a waiting scan filter as the where clause of a scan read
function toWaitingScanSql(cutoffState: DailySpendCutoffState): string {
	return db.select({ id: scans.id }).from(scans).where(toWaitingScanFilter(cutoffState)).toSQL().sql
}

// below the cutoff with the switch off, or with an unavailable state, the filter matches no row
test("the waiting scan filter matches nothing while no limit applies", () => {
	expect(toWaitingScanSql({ status: "unavailable" })).toContain("where false")
	expect(toWaitingScanSql(toDailySpendCutoffState(9999))).toContain("where false")
})

// past the scheduled scans cutoff the filter matches a free owner's undispatched first scan or manual scan
test("past the scheduled scans cutoff, a free owner's first scan or manual scan waits", () => {
	// a free owner who is not an admin, and a running row never dispatched
	const waitingScanSql = toWaitingScanSql(toDailySpendCutoffState(10_000))
	expect(waitingScanSql).toContain('"users"."plan" = $')
	expect(waitingScanSql).toContain(`"users"."role" <> 'admin'`)
	expect(waitingScanSql).toContain('"scans"."dispatched_at" is null')

	// a first scan or a manual scan, with no unverified check
	expect(waitingScanSql).toContain('"earlier_scans"')
	expect(waitingScanSql).toContain('"scans"."is_manual" = $')
	expect(waitingScanSql).not.toContain('"accounts"')
})

// the switch adds an unverified password account's first scan, and leaves out manual scans
test("the switch makes only an unverified password account's first scan wait", () => {
	const waitingScanSql = toWaitingScanSql(toDailySpendCutoffState(0, { isUnverifiedFirstScanLimitOn: true }))
	expect(waitingScanSql).toContain('"earlier_scans"')
	expect(waitingScanSql).toContain('"users"."email_verified" = false')
	expect(waitingScanSql).toContain('"accounts"."provider_id" = $')
	expect(waitingScanSql).not.toContain('"scans"."is_manual"')
})

// a first scan has no earlier scan of its Topic by start time, then by id
test("the first scan is the row with no earlier scan of its topic", () => {
	const waitingScanSql = toWaitingScanSql(toDailySpendCutoffState(10_000))
	expect(waitingScanSql).toContain(
		'not exists (select 1 from "scans" "earlier_scans" where "earlier_scans"."topic_id" = "scans"."topic_id" and ("earlier_scans"."started_at", "earlier_scans"."id") < ("scans"."started_at", "scans"."id"))',
	)
})

// a paid owner's first scan reads only the access row
test("a paid owner's first scan never waits, and reads no cutoff", async () => {
	const sentQueries = stubCutoffQueries({ accessRow: PLUS_USER_ACCESS_ROW, scanSpendDollars: "500" })
	expect(await isFirstScanWaiting("user-1")).toBe(false)
	expect(sentQueries).toHaveLength(1)
})

// a free owner's first scan waits if the day's free-plan spend reaches the scheduled scans cutoff
test("a free owner's first scan waits past the scheduled scans cutoff, and not below it", async () => {
	// below the cutoff
	stubCutoffQueries({ scanSpendDollars: "99.99" })
	expect(await isFirstScanWaiting("user-1")).toBe(false)

	// past the cutoff, with a fresh cache
	restoreConnectionPool()
	stubRedisClient()
	stubCutoffQueries({ scanSpendDollars: "100" })
	expect(await isFirstScanWaiting("user-1")).toBe(true)
})

// below the cutoff the switch makes only an unverified password account's first scan wait
test("with the switch on, an unverified password account's first scan waits and a verified one's does not", async () => {
	// the switch on and no cutoff passed, for an unverified password account
	const switchOnRow = [null, null, null, null, null, true]
	stubCutoffQueries({ overridesRow: switchOnRow, isUnverifiedPasswordUser: true })
	expect(await isFirstScanWaiting("user-1")).toBe(true)

	// the same, for an account that verified or signed in with Google
	restoreConnectionPool()
	stubCutoffQueries({ overridesRow: switchOnRow, isUnverifiedPasswordUser: false })
	expect(await isFirstScanWaiting("user-1")).toBe(false)
})

// past the scheduled scans cutoff only a free user's manual scan waits
test("a free user's manual scan waits past the scheduled scans cutoff, and a paid user's does not", async () => {
	// a free user past the cutoff
	stubCutoffQueries({ scanSpendDollars: "100" })
	expect(await isManualScanWaiting("user-1")).toBe(true)

	// a paid user past the cutoff
	restoreConnectionPool()
	stubCutoffQueries({ accessRow: PLUS_USER_ACCESS_ROW, scanSpendDollars: "100" })
	expect(await isManualScanWaiting("user-1")).toBe(false)
})

// a failed access read is reported, and the first scan does not wait
test("a failed access read waits for nothing and is reported", async () => {
	// the access read fails
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	stubConnectionPool(() => {
		throw new Error("database unreachable")
	})
	expect(await isFirstScanWaiting("user-1")).toBe(false)
	expect(reportErrorSpy).toHaveBeenCalled()
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

// the Topic's scans are read only if the owner is free and a cutoff or the switch can make a scan wait
test("a Topic's first scan waiting check reads the Topic's scans only for a free owner while something can wait", async () => {
	// a paid owner, and a free owner below the cutoff with the switch off, read no scans
	const topic = { id: "topic-1", ownerId: "user-1" }
	const paidQueries = stubCutoffQueries({ accessRow: PLUS_USER_ACCESS_ROW, scanSpendDollars: "100" })
	expect(await isTopicFirstScanWaiting(topic)).toBe(false)
	expect(paidQueries.some(({ text }) => text.includes('"earlier_scans"'))).toBe(false)
	restoreConnectionPool()
	const belowCutoffQueries = stubCutoffQueries({ scanSpendDollars: "50" })
	expect(await isTopicFirstScanWaiting(topic)).toBe(false)
	expect(belowCutoffQueries.some(({ text }) => text.includes('"earlier_scans"'))).toBe(false)

	// a free owner past the cutoff, with a fresh cache, finds the Topic's waiting first scan
	restoreConnectionPool()
	stubRedisClient()
	const pastCutoffQueries = stubConnectionPool(({ text }) => {
		// the Topic's waiting first scan
		if (text.includes('"earlier_scans"')) {
			return [["scan-1"]]
		}

		// no overrides, a free owner, and the day's spend at the cutoff
		if (text.includes('from "spend_control_settings"')) {
			return [EMPTY_OVERRIDES_ROW]
		}
		return text.includes("coalesce(sum(") ? [[text.includes('from "scans"') ? "100" : "0"]] : [FREE_USER_ACCESS_ROW]
	})

	// the waiting check reads the Topic's scans by the Topic's id
	expect(await isTopicFirstScanWaiting(topic)).toBe(true)
	const waitingFirstScanQuery = pastCutoffQueries.find(({ text }) => text.includes('"earlier_scans"'))
	expect(waitingFirstScanQuery?.values).toContain("topic-1")
})
