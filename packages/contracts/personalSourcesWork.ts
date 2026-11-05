// content-free work metadata is the only personal sources state passed through Temporal history
export type PersonalSourcesWork = {
	revision: number
	processedRevision: number
	dirtySince: number | null
	changedAt: number
	now: number
	retryAt?: number
}
export const PERSONAL_SOURCES_TASK_QUEUE = "personal-sources"
export const PERSONAL_SOURCES_EMAIL_TASK_QUEUE = "personal-sources-email"
export const PERSONAL_SOURCES_CONTEXT_SIGNAL = "personalSourcesChanged"

/**
 * Waits for thirty seconds of quiet, capped at five minutes since the first pending revision.
 */
export function personalSourcesWorkDelay(work: PersonalSourcesWork): number | null {
	if (work.revision === work.processedRevision || work.dirtySince === null) {
		return null
	}
	const quietAt = work.changedAt + 30_000
	const deadline = work.dirtySince + 300_000
	return Math.max(0, Math.max(Math.min(quietAt, deadline), work.retryAt ?? 0) - work.now)
}
