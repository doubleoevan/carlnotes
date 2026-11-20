// the slot that each report of the sweep takes in Redis for an hour. a cron run of the sweep is a new process, so the
// hourly counts that monitoring keeps in memory start from zero on every run, and without the slot a condition that
// holds would send a new warning on each run

import { HOUR_MS } from "@carlnotes/contracts/time"
import { takeRateLimitSlot } from "@carlnotes/db/redisRateLimits"

// what a sweep report slot's key starts with in Redis
const SWEEP_REPORT_SLOT_KEY_PREFIX = "sweep-report:"

/**
 * Takes the hour's slot for one report of the sweep, by the report's key, and returns whether to send the report: true
 * if this call took the slot, and true if Redis could not say, so a Redis outage never silences the sweep.
 */
export async function takeSweepReportSlot(reportKey: string): Promise<boolean> {
	const waitMs = await takeRateLimitSlot({ key: `${SWEEP_REPORT_SLOT_KEY_PREFIX}${reportKey}`, slotMs: HOUR_MS })
	return waitMs === null || waitMs === 0
}
