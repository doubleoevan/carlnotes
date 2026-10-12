// time units and time limits that every module shares

// one hour and one day in milliseconds
export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS

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
