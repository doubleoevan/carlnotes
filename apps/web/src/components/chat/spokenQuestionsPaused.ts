import { authClient } from "@carlnotes/client/authClient"
import { isPremiumPlan } from "@carlnotes/contracts/enums"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

// the toast the plans page shows when a mic sends the user there past the spoken questions cutoff, by the mic's call
// to action
export const UPGRADE_PROMPTS = {
	"chat-voice": "Upgrade to speak with Carl",
	"podcast-question": "Upgrade to speak with Carl and Vienna",
} as const

// the call to action of a mic that sends the user to the plans page
export type UpgradePromptCta = keyof typeof UPGRADE_PROMPTS

// what each mic says to a user on premium, which has no plan above it to upgrade to
const PREMIUM_PLAN_PROMPTS: Record<UpgradePromptCta, string> = {
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

/**
 * Returns the handler a mic calls past the spoken questions cutoff, which opens the plans page, or toasts that
 * speaking comes back on the 1st for a user on premium.
 */
export function useSpokenQuestionsPausedAction(upgradePromptCta: UpgradePromptCta): () => void {
	const navigate = useNavigate()
	const { data: session } = authClient.useSession()

	// premium has no plan above it, so its mic toasts when speaking comes back and stays on the page
	return () => {
		const spokenQuestionsPausedAction = toSpokenQuestionsPausedAction(session?.user.plan, upgradePromptCta)
		if (spokenQuestionsPausedAction.kind === "toast") {
			toast(spokenQuestionsPausedAction.prompt)
			return
		}

		// every other plan opens the plans page
		void navigate(spokenQuestionsPausedAction.navigation)
	}
}
