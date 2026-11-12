// accepted sends and email share one UTC ceiling across every account's Sources
import { PERSONAL_SOURCES_DAILY_SEND_LIMIT } from "@carlnotes/contracts/personalSources"
import { DAY_MS, toUtcDay } from "@carlnotes/contracts/time"
import { and, eq, sql } from "drizzle-orm"
import { type DbHandle, db } from "./index"
import { personalSourcesDailyCounts } from "./schema/personalSources"
import { users } from "./schema/users"

/**
 * Reads a database-clock allowance without consuming it or storing routing request content.
 */
export async function readPersonalSourcesAllowance({
	userId,
	transaction = db,
}: {
	userId: string
	transaction?: DbHandle
}): Promise<{ isAvailable: boolean; day: string; now: Date; resetAt: string }> {
	// the ceiling is independent of plan and administrative role
	const [user] = await transaction
		.select({ now: sql<string>`clock_timestamp()::text` })
		.from(users)
		.where(eq(users.id, userId))
	const now = new Date(user?.now ?? "")
	if (!user || !Number.isFinite(now.getTime())) {
		throw new Error("Personal sources allowance requires a current account and database clock")
	}

	// retain both origin rows so already accepted deliveries keep counting
	const day = toUtcDay(now)
	const count = await readPersonalSourcesDailyCount({ userId, day, transaction })
	return {
		isAvailable: count < PERSONAL_SOURCES_DAILY_SEND_LIMIT,
		day,
		now,
		resetAt: new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString(),
	}
}

/**
 * Sums accepted AI sends and forwarded emails without resetting either origin's history.
 */
export async function readPersonalSourcesDailyCount({
	userId,
	day,
	transaction = db,
}: {
	userId: string
	day: string
	transaction?: DbHandle
}): Promise<number> {
	// imports never enter the daily table; the sender lock serializes confirmation reservations
	const [dailyCount] = await transaction
		.select({ count: sql`coalesce(sum(${personalSourcesDailyCounts.acceptedCount}), 0)`.mapWith(Number) })
		.from(personalSourcesDailyCounts)
		.where(and(eq(personalSourcesDailyCounts.userId, userId), eq(personalSourcesDailyCounts.day, day)))
	return dailyCount?.count ?? 0
}
