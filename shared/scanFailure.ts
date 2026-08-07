// how a stored Scan failure reads to a person, shared by the ui and the worker's emails so the two never describe the same failure differently
// matches litellm's spend-limit rejection wherever it appears inside a stored scan error
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
