// when a live SSE stream counts as dropped and how long to wait before reopening it.
// the note stream and the chat room stream both reconnect this way, so the timing is shared here

import { toJitteredBackoffMs } from "@carlnotes/contracts/time"

// a silent stream is declared dead after this long. the server pings every 25 seconds
export const STALE_STREAM_MS = 60_000

// the reconnect stream backoff limits
const RECONNECT_STREAM_MINIMUM_MS = 1000
const RECONNECT_STREAM_MAXIMUM_MS = 30_000

/**
 * The reconnect stream delay for the number of attempts: exponential with jitter, up to a limit.
 */
export function toReconnectStreamDelayMs(failedAttempts: number, random: () => number = Math.random): number {
	return toJitteredBackoffMs({
		firstWaitMs: RECONNECT_STREAM_MINIMUM_MS,
		doublingCount: failedAttempts,
		maximumWaitMs: RECONNECT_STREAM_MAXIMUM_MS,
		random,
	})
}
