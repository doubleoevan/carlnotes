// the day's spend across every user, logged and reported against an alert threshold, and the past hour's signups
// reported against the signup alert threshold

import { db } from "@carlnotes/db"
import { countHourlySignups, loadSpendControlSettings } from "@carlnotes/db/dailySpendCutoffs"
import { loadSpendSince, type RecordedSpend, startOfUtcDay, toSpendCents } from "@carlnotes/db/quotas"
import { users } from "@carlnotes/db/schema/users"
import { readDollarSetting } from "@carlnotes/server/envSettings"
import { reportError, reportThresholdCrossing } from "@carlnotes/server/monitoring"
import { gte, sql } from "drizzle-orm"

// the dollars of spend in one UTC day past which a warning is sent. unset sends none
const GLOBAL_DAILY_SPEND_ALERT_USD = readDollarSetting("GLOBAL_DAILY_SPEND_ALERT_USD", 0)

// the day's spend by what spent it, the total, and how many accounts the day created
export type DailySpend = RecordedSpend & { totalDollars: number; newUserCount: number }

// how many accounts the past hour created, and the signup count at which the alert is sent
export type HourlySignups = { hourlySignupCount: number; hourlySignupAlertCount: number }

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
 * Loads how many accounts the past hour created, and the signup alert threshold from the spend control settings, or
 * its default if the settings read failed.
 */
export async function loadHourlySignups(now = new Date()): Promise<HourlySignups> {
	// count the past hour's signups and read the settings at once
	const [hourlySignupCount, settings] = await Promise.all([countHourlySignups(now), loadSpendControlSettings()])
	return { hourlySignupCount, hourlySignupAlertCount: settings.hourlySignupAlertCount }
}

// the loaders the report reads, each defaulting to the database
export type ReportDailySpendOptions = {
	loadSpend?: () => Promise<DailySpend>
	loadSignups?: () => Promise<HourlySignups>
}

/**
 * Warns if the past hour's signups reach the signup alert threshold, then logs the day's spend and warns past its
 * threshold, and returns the spend, or null if the spend read failed. A failed signup count is reported and the
 * report goes on.
 */
export async function reportDailySpend({
	loadSpend = loadDailySpend,
	loadSignups = loadHourlySignups,
}: ReportDailySpendOptions = {}): Promise<DailySpend | null> {
	// warn about the past hour's signups first, so a failed spend read never hides them
	await reportHourlySignups(loadSignups)

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

// warn if the past hour's signups reach the signup alert threshold, reporting a failed count
async function reportHourlySignups(loadSignups: () => Promise<HourlySignups>): Promise<void> {
	// read the count, reporting a failed read
	let hourlySignups: HourlySignups
	try {
		hourlySignups = await loadSignups()
	} catch (error) {
		console.error("could not count the past hour's signups", error)
		reportError(error, "scheduled-scan")
		return
	}

	// warn at or past the threshold
	if (hourlySignups.hourlySignupCount >= hourlySignups.hourlySignupAlertCount) {
		reportThresholdCrossing({
			condition: "hourly-signups",
			message: "the past hour's signups passed the alert threshold",
			values: { ...hourlySignups },
		})
	}
}
