// the day's spend across every user, logged and reported against an alert threshold

import { db } from "@carlnotes/db"
import { loadSpendSince, type RecordedSpend, startOfUtcDay, toSpendCents } from "@carlnotes/db/quotas"
import { users } from "@carlnotes/db/schema/users"
import { readDollarSetting } from "@carlnotes/server/envSettings"
import { reportError, reportThresholdCrossing } from "@carlnotes/server/monitoring"
import { gte, sql } from "drizzle-orm"

// the dollars of spend in one UTC day past which a warning is sent. unset sends none
const GLOBAL_DAILY_SPEND_ALERT_USD = readDollarSetting("GLOBAL_DAILY_SPEND_ALERT_USD", 0)

// the day's spend by what spent it, the total, and how many accounts the day created
export type DailySpend = RecordedSpend & { totalDollars: number; newUserCount: number }

/**
 * Loads the UTC day's scan, chat, and podcast episode spend across every user, and how many accounts the day created.
 */
export async function loadDailySpend(now = new Date()): Promise<DailySpend> {
	// sum every user's spend since the start of the day, and count the day's signups
	const dayStart = startOfUtcDay(now)
	const [recordedSpend, [newUserRow]] = await Promise.all([
		loadSpendSince({ since: dayStart }),
		db.select({ count: sql<string>`count(*)` }).from(users).where(gte(users.createdAt, dayStart)),
	])
	return {
		...recordedSpend,
		totalDollars: toSpendCents(recordedSpend) / 100,
		newUserCount: Number(newUserRow?.count ?? 0),
	}
}

/**
 * Logs the day's spend and warns past the alert threshold, and returns the spend, or null if the read failed.
 */
export async function reportDailySpend(
	loadSpend: () => Promise<DailySpend> = loadDailySpend,
): Promise<DailySpend | null> {
	// read the day's spend, reporting a failed read
	let dailySpend: DailySpend
	try {
		dailySpend = await loadSpend()
	} catch (error) {
		console.error("could not read the day's spend", error)
		reportError(error, "scheduled-scan")
		return null
	}

	// log the line, then warn once the total passes the threshold
	console.log(JSON.stringify({ gauges: "daily-spend", ...dailySpend }))
	if (GLOBAL_DAILY_SPEND_ALERT_USD > 0 && dailySpend.totalDollars >= GLOBAL_DAILY_SPEND_ALERT_USD) {
		reportThresholdCrossing({
			condition: "daily-spend",
			message: "the day's spend passed the alert threshold",
			values: { ...dailySpend },
		})
	}
	return dailySpend
}
