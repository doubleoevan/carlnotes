// time units, time limits, and the jittered backoff wait that every module shares

// one minute, one hour, and one day in milliseconds
export const MINUTE_MS = 60 * 1000
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS

/**
 * Whether a moment falls on a Saturday or a Sunday in UTC.
 */
export function isUtcWeekend(moment: Date): boolean {
	const utcDay = moment.getUTCDay()
	return utcDay === 0 || utcDay === 6
}

// the work to wait for, how long to wait, and the error to reject with once the time limit passes
export type WithTimeLimitOptions<Result> = { work: Promise<Result>; timeLimitMs: number; toError: () => Error }

/**
 * Returns the work's result, or rejects with the error toError builds once the time limit passes first.
 */
export async function withTimeLimit<Result>({
	work,
	timeLimitMs,
	toError,
}: WithTimeLimitOptions<Result>): Promise<Result> {
	// the time limit, which rejects once it passes
	let timeLimitTimer: ReturnType<typeof setTimeout> | undefined
	const timeLimit = new Promise<never>((_resolve, reject) => {
		timeLimitTimer = setTimeout(() => reject(toError()), timeLimitMs)
	})

	// the work's result, or the time limit's rejection, whichever comes first
	try {
		return await Promise.race([work, timeLimit])
	} finally {
		clearTimeout(timeLimitTimer)
	}
}

/**
 * Returns whether the work finished within the time limit. The timer stops either way, so it never keeps the process
 * alive, and a rejection of the work itself still throws.
 */
export async function isDoneWithin(work: Promise<unknown>, timeLimitMs: number): Promise<boolean> {
	// the error that marks the time limit, told apart from the work's own
	const timeLimitError = new Error(`the work did not finish within ${timeLimitMs} ms`)
	try {
		await withTimeLimit({ work, timeLimitMs, toError: () => timeLimitError })
		return true
	} catch (error) {
		// the time limit passing first reads as false
		if (error === timeLimitError) {
			return false
		}
		throw error
	}
}

// the first wait, how many times it doubles, the longest wait before the jitter, unlimited if unset, and the random
// source, which a test sets
type JitteredBackoffOptions = {
	firstWaitMs: number
	doublingCount: number
	maximumWaitMs?: number
	random?: () => number
}

/**
 * Returns a backoff wait: the first wait doubled the given number of times up to the longest wait, then scaled by a
 * random 50 to 100 percent and rounded to a whole millisecond, so retries that failed together spread apart.
 */
export function toJitteredBackoffMs({
	firstWaitMs,
	doublingCount,
	maximumWaitMs = Number.POSITIVE_INFINITY,
	random = Math.random,
}: JitteredBackoffOptions): number {
	const backoffMs = Math.min(firstWaitMs * 2 ** doublingCount, maximumWaitMs)
	return Math.round(backoffMs * (0.5 + random() / 2))
}

/**
 * Returns a time's UTC day as its ISO date.
 */
export function toUtcDay(moment: Date): string {
	return moment.toISOString().slice(0, 10)
}

/**
 * Returns the last completed UTC day before now, yesterday's ISO date.
 */
export function toLastCompletedUtcDay(now: Date = new Date()): string {
	return toUtcDay(new Date(now.getTime() - DAY_MS))
}

/**
 * Returns the UTC month a time falls in as `YYYY-MM`.
 */
export function toUtcMonth(moment: Date): string {
	return moment.toISOString().slice(0, 7)
}
