// the mobile minimum versions: the oldest app version each platform's api still serves, read on every mobile request
// through a one minute cache and written from the admin console

import type { MobileMinimumVersionRow } from "@carlnotes/contracts/admin"
import type { MobilePlatform } from "@carlnotes/contracts/clientTelemetry"
import { db } from "@carlnotes/db"
import { cacheJson, deleteRedisKeys } from "@carlnotes/db/redis"
import { mobileMinimumVersions } from "@carlnotes/db/schema/mobileMinimumVersions"
import { users } from "@carlnotes/db/schema/users"
import { reportError } from "@carlnotes/server/monitoring"
import { eq } from "drizzle-orm"

// the minimum per platform, null where none is stored
export type MobileMinimumVersions = Record<MobilePlatform, string | null>

// the Redis key every replica reads the minimums through, and how long they are kept there
const MOBILE_MINIMUM_VERSIONS_KEY = "mobile-minimum-versions"
const MOBILE_MINIMUM_VERSIONS_TTL_MS = 60_000

// no minimum on either platform after a read that failed. it is its own object, never a fresh literal, so the cache
// can tell it apart from an empty table by identity and leave it unstored
const UNREAD_MINIMUM_VERSIONS: MobileMinimumVersions = { ios: null, android: null }

/**
 * Returns each platform's minimum version, cached a minute across replicas, with no minimum on any failure.
 */
export function loadCachedMobileMinimumVersions(): Promise<MobileMinimumVersions> {
	return cacheJson({
		key: MOBILE_MINIMUM_VERSIONS_KEY,
		ttlMs: MOBILE_MINIMUM_VERSIONS_TTL_MS,
		load: loadMobileMinimumVersions,
		isStorable: (loadedMinimumVersions) => loadedMinimumVersions !== UNREAD_MINIMUM_VERSIONS,
	})
}

// the stored minimums, or none when the read fails
async function loadMobileMinimumVersions(): Promise<MobileMinimumVersions> {
	try {
		// fold the rows onto the two platforms
		const rows = await db
			.select({ platform: mobileMinimumVersions.platform, minimumVersion: mobileMinimumVersions.minimumVersion })
			.from(mobileMinimumVersions)

		// one value per platform, none on an empty table
		const minimumVersions: MobileMinimumVersions = { ios: null, android: null }
		for (const row of rows) {
			minimumVersions[row.platform as MobilePlatform] = row.minimumVersion
		}
		return minimumVersions
	} catch (error) {
		// serve every build while the table cannot be read
		reportError(error, "database", { read: MOBILE_MINIMUM_VERSIONS_KEY })
		return UNREAD_MINIMUM_VERSIONS
	}
}

/**
 * Returns the console's rows: each stored minimum with when it was saved and by whom.
 */
export async function loadMobileMinimumVersionRows(): Promise<MobileMinimumVersionRow[]> {
	// the stored rows with the saver's username, null once their account closed
	const selectedColumns = {
		platform: mobileMinimumVersions.platform,
		minimumVersion: mobileMinimumVersions.minimumVersion,
		updatedAt: mobileMinimumVersions.updatedAt,
		updatedByUsername: users.username,
	}
	const rows = await db
		.select(selectedColumns)
		.from(mobileMinimumVersions)
		.leftJoin(users, eq(users.id, mobileMinimumVersions.updatedByUserId))

	// return the rows with the dates as text
	return rows.map((row) => ({
		platform: row.platform as MobilePlatform,
		minimumVersion: row.minimumVersion,
		updatedAt: row.updatedAt.toISOString(),
		updatedByUsername: row.updatedByUsername,
	}))
}

export type SaveMobileMinimumVersionOptions = {
	platform: MobilePlatform
	// the new minimum, or null to lift the gate for the platform
	minimumVersion: string | null
	adminUserId: string
}

/**
 * Saves or clears a platform's minimum and drops the cached read, so every replica sees it within its next read.
 */
export async function saveMobileMinimumVersion({
	platform,
	minimumVersion,
	adminUserId,
}: SaveMobileMinimumVersionOptions): Promise<void> {
	// clear the row
	if (minimumVersion === null) {
		await db.delete(mobileMinimumVersions).where(eq(mobileMinimumVersions.platform, platform))
	} else {
		// write the row over the platform's existing one
		const row = { platform, minimumVersion, updatedAt: new Date(), updatedByUserId: adminUserId }
		await db
			.insert(mobileMinimumVersions)
			.values(row)
			.onConflictDoUpdate({ target: mobileMinimumVersions.platform, set: row })
	}

	// drop the cached read
	await deleteRedisKeys(MOBILE_MINIMUM_VERSIONS_KEY)
}
