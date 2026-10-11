// time units and time limits that every module shares

// one day in milliseconds
export const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Returns the work's result, or rejects with the error toError builds once the time limit passes first.
 */
export async function withTimeLimit<Result>(
	work: Promise<Result>,
	timeLimitMs: number,
	toError: () => Error,
): Promise<Result> {
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
