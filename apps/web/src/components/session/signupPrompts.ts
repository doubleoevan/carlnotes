// where the web sends a visitor who tried an action that needs an account: the signup page, tagged with the action's
// call to action and the page to come back to. the prompts themselves are shared with the app in core
import type { SignupPromptCta } from "@carlnotes/core/lib/signupPrompts"

/**
 * Returns the navigation to the signup page for an action a visitor tried, named by its call to action, with the
 * visitor's current page as the page to come back to after signup.
 */
export function toSignupNavigation(signupPromptCta: SignupPromptCta): {
	to: "/signup"
	search: { cta: SignupPromptCta; next: string }
} {
	return {
		to: "/signup",
		search: { cta: signupPromptCta, next: `${window.location.pathname}${window.location.search}` },
	}
}

/**
 * Returns the signup page's url for a link with a cta tag, which returns a visitor to nextPath once they sign up. A tag
 * that names a signup prompt shows that prompt's toast, and any other tag shows none.
 */
export function toSignupHref(ctaTag: string, nextPath: string): string {
	return `/signup?cta=${ctaTag}&next=${encodeURIComponent(nextPath)}`
}
