// the actions that send a visitor to the signup page, each tagged with the call to action it names and the toast the
// signup page shows on arrival. a sign-up link the visitor picks on purpose names no prompt and shows no toast
export const SIGNUP_PROMPTS = {
	chat: "Sign up to chat",
	"chat-voice": "Sign up to speak with Carl",
	"podcast-question": "Sign up to speak with Carl and Vienna",
	"new-topic": "Sign up to create a topic",
	subscribe: "Sign up to follow this topic",
	"team-join": "Sign up to join this team",
	"profile-team-up": "Sign up to team up",
	note: "Sign up to add a note",
} as const

// the call to action of an action that sends a visitor to the signup page
export type SignupPromptCta = keyof typeof SIGNUP_PROMPTS

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
