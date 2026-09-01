// how a stored Scan failure reads to a person, shared by the ui and the worker's emails
const BUDGET_ERROR_PATTERN = /budget has been exceeded/i

/**
 * Whether a stored scan failure is the owner's monthly spend-limit being hit.
 */
export function isBudgetError(error: string | null): boolean {
	return error !== null && BUDGET_ERROR_PATTERN.test(error)
}

/**
 * Maps a scan failure to a readable label for the user.
 */
export function toScanFailureLabel(error: string | null): string {
	// the budget limit is an expected wall, not a malfunction, so it gets plain words
	if (isBudgetError(error)) {
		return "Carl hit this month's budget."
	}
	if (!error) {
		return "This one didn't brew."
	}
	// keep the failure reason itself, dropping the retry wrapper and the provider's error class name
	return error.replace(/^Failed after \d+ attempts?\. Last error: /, "").replace(/^[A-Z]\w*Error: /, "")
}

/**
 * The failure reason to store on a failed Scan. Temporal wraps whatever an activity threw in a failure whose
 * message is only "Activity task failed", so the deepest cause message is stored instead.
 */
export function toScanFailureReason(error: unknown): string {
	// walk the cause chain once, keeping each message and stopping at a cycle
	const messages: string[] = []
	const seen = new Set<unknown>()
	for (let cause: unknown = error; cause && !seen.has(cause); cause = (cause as { cause?: unknown }).cause) {
		seen.add(cause)
		// only a cause with words joins the list
		const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : ""
		if (message.trim()) {
			messages.push(message)
		}
	}
	// the innermost message names the failure itself
	return messages.at(-1) ?? String(error)
}
