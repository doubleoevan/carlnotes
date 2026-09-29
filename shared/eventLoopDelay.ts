// the event loop's delay in this process, from the delay histogram Node's perf_hooks provide and Bun supports
import { type IntervalHistogram, monitorEventLoopDelay } from "node:perf_hooks"

// how often the histogram samples the event loop's delay, in milliseconds
const HISTOGRAM_RESOLUTION_MS = 20

// the histogram records nanoseconds, and every reading is reported in milliseconds
const NANOSECONDS_PER_MILLISECOND = 1_000_000

// the process's one histogram, started by the first call to start it
let delayHistogram: IntervalHistogram | undefined

/**
 * Starts measuring the event loop's delay, once per process. The histogram never keeps the process alive.
 */
export function startEventLoopDelay(): void {
	if (delayHistogram) {
		return
	}
	delayHistogram = monitorEventLoopDelay({ resolution: HISTOGRAM_RESOLUTION_MS })
	delayHistogram.enable()
}

/**
 * Returns the event loop delay's 99th percentile and largest value since the last reset, in milliseconds,
 * or zeros before the histogram starts or records a sample.
 */
export function readEventLoopDelay(): { p99Ms: number; maxMs: number } {
	// zeros until the histogram starts
	if (!delayHistogram) {
		return { p99Ms: 0, maxMs: 0 }
	}
	return {
		p99Ms: toMilliseconds(delayHistogram.percentile(99)),
		maxMs: toMilliseconds(delayHistogram.max),
	}
}

/**
 * Clears the recorded delays, so the next reading covers only what follows.
 */
export function resetEventLoopDelay(): void {
	delayHistogram?.reset()
}

// a reading in whole milliseconds, with a missing or unreadable value as zero
function toMilliseconds(nanoseconds: number): number {
	return Number.isFinite(nanoseconds) ? Math.round(nanoseconds / NANOSECONDS_PER_MILLISECOND) : 0
}
