// how long one email or push send may take, and how its retries back off: 15 seconds, doubling up to 10 minutes
// apart, for at most 10 attempts, about 45 minutes in all

export const SEND_TIMEOUT_MS = 60 * 1000

export const SEND_RETRY_POLICY = {
	initialInterval: 15 * 1000,
	backoffCoefficient: 2,
	maximumInterval: 10 * 60 * 1000,
	maximumAttempts: 10,
}
