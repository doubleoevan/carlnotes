// the day's spend across every user, logged and reported against an alert threshold
import { reportError, reportThresholdCrossing } from "@shared/monitoring"
import { gte, sql } from "drizzle-orm"
import { db } from "../db"
import { startOfUtcDay } from "../db/quotas"
import { chatTurns } from "../db/schema/chat"
import { podcastEpisodes } from "../db/schema/podcast"
import { scans } from "../db/schema/scans"
import { users } from "../db/schema/users"
import { toDollarSetting } from "./budget"

// the dollars of spend in one UTC day past which a warning is sent. unset sends none
const GLOBAL_DAILY_SPEND_ALERT_USD = toDollarSetting("GLOBAL_DAILY_SPEND_ALERT_USD", 0)

// the day's spend by what spent it, the total, and how many accounts the day created
export type DailySpend = {
	scanDollars: number
	chatDollars: number
	podcastEpisodeDollars: number
	totalDollars: number
	newUserCount: number
}

/**
 * Reads the UTC day's scan, chat, and podcast episode spend across every user, and how many accounts the day created.
 */
export async function readDailySpend(now = new Date()): Promise<DailySpend> {
	// sum each table's cost since the start of the day, and count the day's signups
	const dayStart = startOfUtcDay(now)
	const [[scanSpendRow], [chatSpendRow], [podcastEpisodeSpendRow], [newUserRow]] = await Promise.all([
		db
			.select({ dollars: sql<string>`coalesce(sum(${scans.cost}), 0)` })
			.from(scans)
			.where(gte(scans.startedAt, dayStart)),
		db
			.select({ dollars: sql<string>`coalesce(sum(${chatTurns.cost}), 0)` })
			.from(chatTurns)
			.where(gte(chatTurns.createdAt, dayStart)),
		db
			.select({ dollars: sql<string>`coalesce(sum(${podcastEpisodes.cost}), 0)` })
			.from(podcastEpisodes)
			.where(gte(podcastEpisodes.createdAt, dayStart)),
		db.select({ count: sql<string>`count(*)` }).from(users).where(gte(users.createdAt, dayStart)),
	])

	// the three sums, their total, and the signup count
	const scanDollars = Number(scanSpendRow?.dollars ?? 0)
	const chatDollars = Number(chatSpendRow?.dollars ?? 0)
	const podcastEpisodeDollars = Number(podcastEpisodeSpendRow?.dollars ?? 0)
	return {
		scanDollars,
		chatDollars,
		podcastEpisodeDollars,
		totalDollars: scanDollars + chatDollars + podcastEpisodeDollars,
		newUserCount: Number(newUserRow?.count ?? 0),
	}
}

/**
 * Logs the day's spend and warns past the alert threshold, and returns the spend, or null if the read failed.
 */
export async function reportDailySpend(
	readSpend: () => Promise<DailySpend> = readDailySpend,
): Promise<DailySpend | null> {
	// read the day's spend, reporting a failed read
	let dailySpend: DailySpend
	try {
		dailySpend = await readSpend()
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
