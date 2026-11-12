// time units and time limits that every module shares

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
