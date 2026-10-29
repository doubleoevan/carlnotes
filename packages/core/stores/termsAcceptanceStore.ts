// whether the Terms acceptance dialog is open on either app: a write rejected for the Terms opens it, and the user
// can put it off until the next rejected write. the rejected write waits for the dialog's outcome
import { toStoreListeners } from "./storeListeners"

// how the dialog closed
export type TermsAcceptanceOutcome = "accepted" | "dismissed"

// whether a write came back rejected for the Terms since the last acceptance, which user put the dialog off, and the
// rejected writes waiting on the dialog
let isTermsAcceptanceRequested = false
let dismissedUserId: string | null = null
let outcomeWaiters: ((outcome: TermsAcceptanceOutcome) => void)[] = []
const { publish, useStoreVersion } = toStoreListeners()

/**
 * Records that a write was rejected for the Terms, so the acceptance dialog opens even if the user put it off, and
 * returns how the dialog closes.
 */
export function requestTermsAcceptance(): Promise<TermsAcceptanceOutcome> {
	// open the dialog, once
	if (!isTermsAcceptanceRequested || dismissedUserId) {
		isTermsAcceptanceRequested = true
		dismissedUserId = null
		publish()
	}

	// return a promise that settles with how the dialog closes
	return new Promise((resolve) => {
		outcomeWaiters.push(resolve)
	})
}

/**
 * Puts the dialog off for one user. Reading stays open, and the next write rejected for the Terms reopens it.
 */
export function dismissTermsAcceptance(userId: string): void {
	isTermsAcceptanceRequested = false
	dismissedUserId = userId
	settleOutcomeWaiters("dismissed")
	publish()
}

/**
 * Clears the request once the user accepted.
 */
export function clearTermsAcceptanceRequest(): void {
	if (isTermsAcceptanceRequested || dismissedUserId) {
		isTermsAcceptanceRequested = false
		dismissedUserId = null
		publish()
	}
	settleOutcomeWaiters("accepted")
}

// a user, and whether their account's accepted version is older than the published one
type TermsAcceptanceState = { userId: string; isVersionOutdated: boolean }

/**
 * Returns whether the dialog is open for a user: a write was rejected for the Terms, or the account's version is stale
 * and this user has not put the dialog off.
 */
export function isTermsAcceptanceOpen({ userId, isVersionOutdated }: TermsAcceptanceState): boolean {
	if (isTermsAcceptanceRequested) {
		return true
	}
	return isVersionOutdated && dismissedUserId !== userId
}

/**
 * Returns whether the dialog is open, re-rendering the caller as the store changes.
 */
export function useIsTermsAcceptanceOpen(state: TermsAcceptanceState): boolean {
	useStoreVersion()
	return isTermsAcceptanceOpen(state)
}

// tell every waiting write how the dialog closed
function settleOutcomeWaiters(outcome: TermsAcceptanceOutcome): void {
	const waiters = outcomeWaiters
	outcomeWaiters = []
	for (const resolve of waiters) {
		resolve(outcome)
	}
}
