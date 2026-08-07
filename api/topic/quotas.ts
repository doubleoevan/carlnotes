// the scan quota reads the api routes use, and the utc month boundary the spend windows roll over on
import { scansRemainingToday } from "../../db/quotas"

// the per-user scan-quota checks live in db/quotas, next to the tables they read, so the worker shares them
export { loadBillingAccess, scansToday, startOfUtcDay } from "../../db/quotas"

/**
 * Scans left today for the plan, or null for a user who may not scan this topic at all.
 */
export async function scansRemaining(userId: string, canScan: boolean): Promise<number | null> {
	// a user who may not scan never sees the quota
	if (!canScan) {
		return null
	}

	// scans left today under the plan
	return scansRemainingToday(userId)
}

/**
 * The UTC midnight starting the given moment's month. Monthly spend rolls over on the first of the month, UTC.
 */
export function startOfUtcMonth(moment: Date): Date {
	return new Date(Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), 1))
}
