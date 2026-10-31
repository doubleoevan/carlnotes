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

// what each mic says when speaking comes back on the 1st: the line a user on premium reads, which has no plan above
// it to upgrade to, and the line the mobile app shows on every plan
export const PREMIUM_PLAN_PROMPTS: Record<UpgradePromptCta, string> = {
	"chat-voice": "Speak with Carl again on the 1st.",
	"podcast-question": "Speak with Carl and Vienna again on the 1st.",
}

// what a mic does past the spoken questions cutoff: a toast that stays on the page, or the plans page
export type SpokenQuestionsPausedAction =
	| { kind: "toast"; prompt: string }
	| { kind: "navigate"; navigation: { to: "/plans"; search: { cta: UpgradePromptCta } } }

/**
 * Returns what a mic does past the spoken questions cutoff for the user's plan. Premium has no plan above it, so its
 * mic toasts that speaking comes back on the 1st. Every other plan opens the plans page.
 */
export function toSpokenQuestionsPausedAction(
	plan: string | null | undefined,
	upgradePromptCta: UpgradePromptCta,
): SpokenQuestionsPausedAction {
	return isPremiumPlan(plan)
		? { kind: "toast", prompt: PREMIUM_PLAN_PROMPTS[upgradePromptCta] }
		: { kind: "navigate", navigation: { to: "/plans", search: { cta: upgradePromptCta } } }
}
