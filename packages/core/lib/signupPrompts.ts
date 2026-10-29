// the actions that send a visitor to sign-up, each tagged with the call to action it names and the prompt the sign-up
// page shows on arrival. a sign-up link the visitor picks on purpose names no prompt and shows none
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

// the call to action of an action that sends a visitor to sign-up
export type SignupPromptCta = keyof typeof SIGNUP_PROMPTS

/**
 * Returns the prompt that a call to action names, or null for one the prompts do not have.
 */
export function toCtaPrompt(prompts: Readonly<Record<string, string>>, cta: string | null): string | null {
	return cta !== null && Object.hasOwn(prompts, cta) ? (prompts[cta] ?? null) : null
}
