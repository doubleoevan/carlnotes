// how a stored Scan failure reads to a person, shared by the ui, the api, and the worker
const BUDGET_ERROR_PATTERN = /budget has been exceeded/i

// how a spent budget reads to a person, on a failed Scan and on a rejected manual scan
export const SCAN_SPENT_BUDGET_LABEL = "Carl hit this month's coffee budget."

// the failure reason stored on a scheduled Scan that never started because its owner's budget is spent
export const SCHEDULED_SCAN_SPENT_BUDGET_REASON =
	"Carl ran out of coffee this month, so the scheduled scan didn't start"

/**
 * Whether a stored scan failure is a spent monthly budget.
 * The failure is either the proxy's rejection or the reason that the sweep saves.
 */
export function isBudgetError(error: string | null): boolean {
	return error !== null && (error === SCHEDULED_SCAN_SPENT_BUDGET_REASON || BUDGET_ERROR_PATTERN.test(error))
}

/**
 * Maps a scan failure to a readable label for the user.
 */
export function toScanFailureLabel(error: string | null): string {
	// the budget limit is an expected wall, not a malfunction, so it gets plain words
	if (isBudgetError(error)) {
		return SCAN_SPENT_BUDGET_LABEL
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
