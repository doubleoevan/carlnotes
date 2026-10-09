// the runner that tries a failed attempt again after a fixed wait

// the attempt limit, the wait between attempts, the attempt itself, and which failures are worth another attempt
type RetryOptions<Result> = {
	attempts: number
	delayMs: number
	// one attempt, given its number from 1
	runAttempt: (attempt: number) => Promise<Result>
	// whether a failure is worth another attempt. every failure is, if this is left out
	isRetryable?: (error: unknown) => boolean
	// runs after a failed attempt that will be tried again, before the wait
	onRetry?: (attempt: number) => void
}

/**
 * Runs an attempt until one succeeds, waiting between attempts, and returns its result.
 * Throws a failure that is not retryable, and the last attempt's failure.
 */
export async function runWithRetries<Result>({
	attempts,
	delayMs,
	runAttempt,
	isRetryable = () => true,
	onRetry,
}: RetryOptions<Result>): Promise<Result> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await runAttempt(attempt)
		} catch (error) {
			// a failure that is not retryable, or the last attempt's failure, ends the run
			if (!isRetryable(error) || attempt >= attempts) {
				throw error
			}

			// report the failure, wait, and try again
			onRetry?.(attempt)
			await Bun.sleep(delayMs)
		}
	}
}
