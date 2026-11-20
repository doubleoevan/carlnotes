// daily spend cutoff waiting scan tests: the waiting scan filter, which first and manual scans wait past the scheduled
// scans cutoff or under the unverified accounts switch, a failed access read, and a Topic's first scan waiting check
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
	isFirstScanWaiting,
	isManualScanWaiting,
	isTopicFirstScanWaiting,
	toWaitingScanFilter,
} from "./dailySpendCutoffs"
import {
	EMPTY_OVERRIDES_ROW,
	SPEND_CONTROL_ENV_NAMES,
	stubCutoffQueries,
	toDailySpendCutoffState,
	UNVERIFIED_SWITCH_ON_ROW,
} from "./dailySpendCutoffTestFixtures"
import { db } from "./index"
import { restoreRedisClient, stubRedisClient } from "./redisClientStub"
import { scans } from "./schema/scans"

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

// the switch adds an unverified password account's first scan and manual scan, and no other account's
test("the switch makes an unverified password account's first scan or manual scan wait", () => {
	const waitingScanSql = toWaitingScanSql(toDailySpendCutoffState(0, { isUnverifiedFirstScanLimitOn: true }))
	expect(waitingScanSql).toContain('"earlier_scans"')
	expect(waitingScanSql).toContain('"scans"."is_manual" = $')
	expect(waitingScanSql).toContain('"users"."email_verified" = false')
	expect(waitingScanSql).toContain('"accounts"."provider_id" = $')
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
	stubCutoffQueries({ overridesRow: UNVERIFIED_SWITCH_ON_ROW, isUnverifiedPasswordUser: true })
	expect(await isFirstScanWaiting("user-1")).toBe(true)

	// the same, for an account that verified or signed in with Google
	restoreConnectionPool()
	stubCutoffQueries({ overridesRow: UNVERIFIED_SWITCH_ON_ROW, isUnverifiedPasswordUser: false })
	expect(await isFirstScanWaiting("user-1")).toBe(false)
})

// below the cutoff the switch makes an unverified password account's manual scan wait as its first scan does
test("with the switch on, an unverified password account's manual scan waits and no other account's does", async () => {
	// the switch on and no cutoff passed, for an unverified password account
	stubCutoffQueries({ overridesRow: UNVERIFIED_SWITCH_ON_ROW, isUnverifiedPasswordUser: true })
	expect(await isManualScanWaiting("user-1")).toBe(true)

	// an account that verified or signed in with a provider, then a paid unverified password account
	restoreConnectionPool()
	stubCutoffQueries({ overridesRow: UNVERIFIED_SWITCH_ON_ROW, isUnverifiedPasswordUser: false })
	expect(await isManualScanWaiting("user-1")).toBe(false)
	restoreConnectionPool()
	stubCutoffQueries({
		accessRow: PLUS_USER_ACCESS_ROW,
		overridesRow: UNVERIFIED_SWITCH_ON_ROW,
		isUnverifiedPasswordUser: true,
	})
	expect(await isManualScanWaiting("user-1")).toBe(false)

	// the switch off, for an unverified password account
	restoreConnectionPool()
	stubRedisClient()
	stubCutoffQueries({ isUnverifiedPasswordUser: true })
	expect(await isManualScanWaiting("user-1")).toBe(false)
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
