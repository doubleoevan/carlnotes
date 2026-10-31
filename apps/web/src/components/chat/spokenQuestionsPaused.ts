// the web mic's action past the spoken questions cutoff: the plans page, or a toast for a user on premium
import { authClient } from "@carlnotes/client/authClient"
import { toSpokenQuestionsPausedAction, type UpgradePromptCta } from "@carlnotes/core/lib/spokenQuestionsPaused"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

/**
 * Returns the handler a mic calls past the spoken questions cutoff, which opens the plans page, or toasts that
 * speaking comes back on the 1st for a user on premium.
 */
export function useSpokenQuestionsPausedAction(upgradePromptCta: UpgradePromptCta): () => void {
	const navigate = useNavigate()
	const { data: session } = authClient().useSession()

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
