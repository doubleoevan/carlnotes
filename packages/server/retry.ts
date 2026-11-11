// the runner that tries a failed attempt again after a wait, fixed or chosen from the failure

// how long to wait before the next attempt. a fixed wait, or a function of the failure and the attempt number, which
// returns null to end the run with that failure
type RetryDelay =
	| { delayMs: number; toDelayMs?: never }
	| { toDelayMs: (error: unknown, attempt: number) => number | null; delayMs?: never }

// the attempt limit, the attempt itself, and which failures are worth another attempt, with the wait between attempts
type RetryOptions<Result> = RetryDelay & {
	attempts: number
	// one attempt, given its number from 1
	runAttempt: (attempt: number) => Promise<Result>
	// whether a failure is worth another attempt. every failure is, if this is left out
	isRetryable?: (error: unknown) => boolean
	// runs after a failed attempt that will be tried again, before the wait
	onRetry?: (attempt: number, error: unknown, delayMs: number) => void
}

/**
 * Runs an attempt until one succeeds, waiting between attempts, and returns its result.
 * Throws a failure that is not retryable, a failure whose wait is null, and the last attempt's failure.
 */
export async function runWithRetries<Result>({
	attempts,
	delayMs,
	toDelayMs,
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

			// a wait the failure rules out ends the run too
			const nextDelayMs = toDelayMs ? toDelayMs(error, attempt) : delayMs
			if (nextDelayMs === null || nextDelayMs === undefined) {
				throw error
			}

			// report the failure, wait, and try again
			onRetry?.(attempt, error, nextDelayMs)
			await Bun.sleep(nextDelayMs)
		}
	}
}
