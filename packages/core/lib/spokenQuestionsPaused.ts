// what a mic does past the spoken questions cutoff: the plans page's upgrade lines by the mic's call to action, the
// line a mic says when speaking comes back on the 1st, and the action a plan's mic takes
import { isPremiumPlan } from "@carlnotes/contracts/enums"

// the toast the plans page shows when a mic sends the user there past the spoken questions cutoff, by the mic's call
// to action
export const UPGRADE_PROMPTS = {
	"chat-voice": "Upgrade to speak with Carl",
	"podcast-question": "Upgrade to speak with Carl and Vienna",
} as const

// the call to action of a mic that sends the user to the plans page
export type UpgradePromptCta = keyof typeof UPGRADE_PROMPTS

/**
 * Returns a mic's call to action: the podcast player's for a podcast question, and a composer's otherwise.
 */
export function toUpgradePromptCta(isPodcastEpisodeQuestion = false): UpgradePromptCta {
	return isPodcastEpisodeQuestion ? "podcast-question" : "chat-voice"
}

// what each mic says when speaking comes back on the 1st, for a user with no plan to upgrade to: premium, which has
// no plan above it, and a user who cannot buy a plan where the mic is
export const NO_UPGRADE_PROMPTS: Record<UpgradePromptCta, string> = {
	"chat-voice": "Speak with Carl again on the 1st.",
	"podcast-question": "Speak with Carl and Vienna again on the 1st.",
}

// what a mic does past the spoken questions cutoff: a toast that stays on the page, or the plans page
export type SpokenQuestionsPausedAction =
	| { kind: "toast"; prompt: string }
	| { kind: "navigate"; navigation: { to: "/plans"; search: { cta: UpgradePromptCta } } }

/**
 * Returns what a mic does past the spoken questions cutoff for the user's plan. Premium has no plan above it, and a
 * user who cannot buy a plan where the mic is has no plan to upgrade to, so either mic toasts that speaking comes back
 * on the 1st. Every other plan opens the plans page.
 */
export function toSpokenQuestionsPausedAction(
	plan: string | null | undefined,
	upgradePromptCta: UpgradePromptCta,
	canPurchase = true,
): SpokenQuestionsPausedAction {
	return isPremiumPlan(plan) || !canPurchase
		? { kind: "toast", prompt: NO_UPGRADE_PROMPTS[upgradePromptCta] }
		: { kind: "navigate", navigation: { to: "/plans", search: { cta: upgradePromptCta } } }
}
