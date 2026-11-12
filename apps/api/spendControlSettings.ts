// the spend control settings on the admin console: the daily spend cutoffs read fresh with the day's free-plan spend,
// the worst case monthly spend, the waiting scan count, and the past hour's signups, and the save that writes the
// overrides and drops their cached reads

import type { AdminDailySpendCutoffs, AdminSpendControlSetting } from "@carlnotes/contracts/admin"
import type { SpendControlSettingsPayload } from "@carlnotes/contracts/payloads"
import { toCentsFromDollars } from "@carlnotes/contracts/plans"
import { db } from "@carlnotes/db"
import {
	countHourlySignups,
	type DailySpendCutoffState,
	defaultSpendControlSettings,
	isDailySpendCutoffPassed,
	loadFreePlanSpendCents,
	NO_SPEND_CONTROL_OVERRIDES,
	SPEND_CONTROL_SETTINGS_KEY,
	type SpendControlOverrides,
	toFreePlanSpendKey,
	toSpendControlSettings,
	toWaitingScanFilter,
} from "@carlnotes/db/dailySpendCutoffs"
import { deleteRedisKeys } from "@carlnotes/db/redis"
import { scans } from "@carlnotes/db/schema/scans"
import { spendControlSettings } from "@carlnotes/db/schema/spendControlSettings"
import { users } from "@carlnotes/db/schema/users"
import { loadWorstCaseMonthlySpend } from "@carlnotes/db/worstCaseMonthlySpend"
import { count, eq } from "drizzle-orm"

/**
 * Loads the console's daily spend card straight from the database: the day's free-plan spend, the worst case monthly
 * spend, each setting with its default and whether an override replaced it, each cutoff's passed state, the waiting
 * scan count, the past hour's signups, and the last save.
 */
export async function loadAdminDailySpendCutoffs(now = new Date()): Promise<AdminDailySpendCutoffs> {
	// read the stored row with its saver, the day's free-plan spend, the worst case monthly spend, and the past hour's
	// signups at once
	const [storedRow, freePlanSpendCents, worstCaseMonthlySpend, hourlySignupCount] = await Promise.all([
		loadStoredSpendControlRow(),
		loadFreePlanSpendCents(now),
		loadWorstCaseMonthlySpend(now),
		countHourlySignups(now),
	])
	const overrides = storedRow ?? NO_SPEND_CONTROL_OVERRIDES
	const settings = toSpendControlSettings(overrides)
	const defaultSettings = defaultSpendControlSettings()

	// count the scans that wait under these settings
	const cutoffState: DailySpendCutoffState = { status: "loaded", freePlanSpendCents, settings }
	const [waitingScanRow] = await db.select({ count: count() }).from(scans).where(toWaitingScanFilter(cutoffState))

	// each cutoff with its amount, default, override marker, and passed state
	const cutoffs = [
		{
			kind: "podcastEpisodes" as const,
			...toAdminSetting(overrides.podcastEpisodesCutoffCents, defaultSettings.podcastEpisodesCutoffCents),
			isPassed: isDailySpendCutoffPassed(cutoffState, "podcastEpisodes"),
		},
		{
			kind: "scheduledScans" as const,
			...toAdminSetting(overrides.scheduledScansCutoffCents, defaultSettings.scheduledScansCutoffCents),
			isPassed: isDailySpendCutoffPassed(cutoffState, "scheduledScans"),
		},
		{
			kind: "chat" as const,
			...toAdminSetting(overrides.chatCutoffCents, defaultSettings.chatCutoffCents),
			isPassed: isDailySpendCutoffPassed(cutoffState, "chat"),
		},
	]
	return {
		freePlanSpendCents,
		worstCaseMonthlySpend,
		cutoffs,
		firstScanDispatchLimit: toAdminSetting(overrides.firstScanDispatchLimit, defaultSettings.firstScanDispatchLimit),
		waitingScanCount: waitingScanRow?.count ?? 0,
		hourlySignupAlertCount: toAdminSetting(overrides.hourlySignupAlertCount, defaultSettings.hourlySignupAlertCount),
		hourlySignupCount,
		isUnverifiedFirstScanLimitOn: settings.isUnverifiedFirstScanLimitOn,
		updatedAt: storedRow?.updatedAt.toISOString() ?? null,
		updatedByUsername: storedRow?.updatedByUsername ?? null,
	}
}

// the stored overrides with when they were saved and the saver's username, null once the saver's account closed
type StoredSpendControlRow = SpendControlOverrides & { updatedAt: Date; updatedByUsername: string | null }

// the stored row with its saver, or undefined for an empty table
async function loadStoredSpendControlRow(): Promise<StoredSpendControlRow | undefined> {
	const [storedRow] = await db
		.select({
			podcastEpisodesCutoffCents: spendControlSettings.podcastEpisodesCutoffCents,
			scheduledScansCutoffCents: spendControlSettings.scheduledScansCutoffCents,
			chatCutoffCents: spendControlSettings.chatCutoffCents,
			firstScanDispatchLimit: spendControlSettings.firstScanDispatchLimit,
			hourlySignupAlertCount: spendControlSettings.hourlySignupAlertCount,
			isUnverifiedFirstScanLimitOn: spendControlSettings.isUnverifiedFirstScanLimitOn,
			updatedAt: spendControlSettings.updatedAt,
			updatedByUsername: users.username,
		})
		.from(spendControlSettings)
		.leftJoin(users, eq(users.id, spendControlSettings.updatedByUserId))
	return storedRow
}

// one numeric setting as the console shows it: the override where one is stored, else the default
function toAdminSetting(overrideValue: number | null, defaultValue: number): AdminSpendControlSetting {
	return { value: overrideValue ?? defaultValue, defaultValue, isOverridden: overrideValue !== null }
}

// the saved settings and the admin who saved them
export type SaveSpendControlSettingsOptions = { payload: SpendControlSettingsPayload; adminUserId: string }

/**
 * Writes the overrides over the one row, then drops the cached settings and the day's cached free-plan spend, so every
 * replica reads the new settings on its next read.
 */
export async function saveSpendControlSettings({
	payload,
	adminUserId,
}: SaveSpendControlSettingsOptions): Promise<void> {
	// the row in cents, with a null for each setting left to its default
	const row = {
		podcastEpisodesCutoffCents: toCents(payload.podcastEpisodesCutoffDollars),
		scheduledScansCutoffCents: toCents(payload.scheduledScansCutoffDollars),
		chatCutoffCents: toCents(payload.chatCutoffDollars),
		firstScanDispatchLimit: payload.firstScanDispatchLimit,
		hourlySignupAlertCount: payload.hourlySignupAlertCount,
		isUnverifiedFirstScanLimitOn: payload.isUnverifiedFirstScanLimitOn,
		updatedAt: new Date(),
		updatedByUserId: adminUserId,
	}

	// write the one row, then drop both cached reads
	await db
		.insert(spendControlSettings)
		.values({ id: 1, ...row })
		.onConflictDoUpdate({ target: spendControlSettings.id, set: row })
	await deleteRedisKeys(SPEND_CONTROL_SETTINGS_KEY, toFreePlanSpendKey(new Date()))
}

// a dollar amount in whole cents, or null for no override
function toCents(dollars: number | null): number | null {
	return dollars === null ? null : toCentsFromDollars(dollars)
}
