// the lines the sign-in, sign-out, sign-up, and close-account controls say, shared by the web and the mobile app
import type { BillingProvider } from "@carlnotes/contracts/plans"
import { isStoreProvider, STORE_NAMES, type StoreProvider } from "@carlnotes/contracts/storeBilling"

// what a page says if a provider's sign-in will not open
export const OAUTH_ERROR_TEXT = "That sign-in didn't open. Try another one, or email."

// what a request that never reached the api says
export const REQUEST_FAILED_TEXT = "That didn't reach Carl. Try again."

// what a form says if a save is rejected
export const SAVE_FAILED_TEXT = "That didn't save. Try again."

// what a sign-out that failed says, with the reason if there is one
export function toSignOutFailedText(reason: string | undefined): string {
	return `Carl could not sign you out. ${reason ?? "Try again in a moment."}`
}

// what the close-account section says above its button
const CLOSE_ACCOUNT_LOSS_TEXT = "Your topics, findings, and chats go with it, and you stop following every topic."
const CLOSE_ACCOUNT_SECTION_TEXT = `${CLOSE_ACCOUNT_LOSS_TEXT} Any paid plan is canceled. This cannot be undone.`

// the close-account confirmation
export const CLOSE_ACCOUNT_CONFIRMATION = {
	title: "Close your account?",
	body: "Everything Carl kept for you goes with it, and any paid plan is canceled. This cannot be undone.",
	confirmLabel: "Close account",
	cancelLabel: "Keep it",
} as const

// what the close-account section and its confirmation say, and the store that keeps billing a store subscriber
export type CloseAccountCopy = { storeProvider: StoreProvider | null; sectionText: string; confirmationBody: string }

/**
 * Returns what the close-account section and its confirmation say to a user billed by the provider. A store
 * subscriber is told the store keeps billing until the plan is canceled there.
 */
export function toCloseAccountCopy(provider: BillingProvider | null): CloseAccountCopy {
	if (!isStoreProvider(provider)) {
		return {
			storeProvider: null,
			sectionText: CLOSE_ACCOUNT_SECTION_TEXT,
			confirmationBody: CLOSE_ACCOUNT_CONFIRMATION.body,
		}
	}

	// the store's billing line in place of the canceled plan
	const storePlanLine = `Your plan keeps billing through ${STORE_NAMES[provider]} until you cancel it there.`
	return {
		storeProvider: provider,
		sectionText: `${CLOSE_ACCOUNT_LOSS_TEXT} ${storePlanLine} This cannot be undone.`,
		confirmationBody: `Everything Carl kept for you goes with it. ${storePlanLine} This cannot be undone.`,
	}
}

// what the app's sign-up form says if the install could not be verified
export const APP_SIGNUP_GATE_FAILED_TEXT = "Carl couldn't verify this install. Sign up on carlnotes.com instead."

// the verification notice a password signup shows
export const VERIFY_EMAIL_TITLE = "Check your email"
export function toVerifyEmailNoticeText(email: string): string {
	return `We sent a link to confirm ${email}. You don't have to click it now. You can start using CarlNotes right away.`
}

// the line every sign-up path shows above its buttons: continuing accepts the Terms and the Privacy Policy
export const TERMS_AGREEMENT_COPY = {
	prompt: "By continuing you agree to the ",
	termsLink: "Terms of Service",
	joiner: " and the ",
	privacyLink: "Privacy Policy",
	ending: ".",
} as const
