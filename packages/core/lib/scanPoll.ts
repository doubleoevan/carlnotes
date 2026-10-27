// how often to re-fetch the page while a scan is running
// a polled scan shows its first findings within seconds, and a long one is not worth as fast of a refetch.
// the rate steps down the longer the scan runs.
const FAST_POLL_MS = 3000
const MEDIUM_POLL_MS = 10_000
const SLOW_POLL_MS = 30_000

// how long the topic scan poll holds each of the first two poll rates before slowing down
const FAST_POLL_UNTIL_MS = 30_000
const MEDIUM_POLL_UNTIL_MS = 120_000

/**
 * Returns the refetch delay based on how long the scan has been watched.
 */
export function toScanPollMs(watchedMs: number): number {
	if (watchedMs < FAST_POLL_UNTIL_MS) {
		return FAST_POLL_MS
	}
	return watchedMs < MEDIUM_POLL_UNTIL_MS ? MEDIUM_POLL_MS : SLOW_POLL_MS
}
