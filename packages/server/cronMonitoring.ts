// a scheduled job's check-ins to its Sentry cron monitor

import * as Sentry from "@sentry/bun"
import { isMonitoringStarted } from "./monitoring"

// a Sentry cron monitor's schedule, check-in margin and longest run in minutes, and its alert thresholds
export type CronMonitorConfig = NonNullable<Parameters<typeof Sentry.captureCheckIn>[1]>

/**
 * Sends a job's in-progress check-in to its Sentry cron monitor, which the check-in creates or updates from its config,
 * and returns the check-in's id, or null if monitoring did not start.
 */
export function startCronCheckIn(monitorSlug: string, cronMonitorConfig: CronMonitorConfig): string | null {
	return isMonitoringStarted() ? Sentry.captureCheckIn({ monitorSlug, status: "in_progress" }, cronMonitorConfig) : null
}

// a finished job's check-in: its id and monitor, whether the job succeeded, and how long it ran in seconds
type FinishCronCheckInOptions = {
	checkInId: string
	monitorSlug: string
	isSucceeded: boolean
	durationSeconds: number
}

/**
 * Sends a finished job's check-in to its Sentry cron monitor, ok or error by its result.
 */
export function finishCronCheckIn({
	checkInId,
	monitorSlug,
	isSucceeded,
	durationSeconds,
}: FinishCronCheckInOptions): void {
	Sentry.captureCheckIn({ checkInId, monitorSlug, status: isSucceeded ? "ok" : "error", duration: durationSeconds })
}
