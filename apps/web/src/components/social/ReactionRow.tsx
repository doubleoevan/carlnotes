import { type ReactionRowAdapterProps, ReactionRow as SharedReactionRow } from "@carlnotes/core/components/ReactionRow"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { toSignupNavigation } from "@/components/session/signupPrompts"
import { SOCIAL_ELEMENTS } from "./socialElements"

/**
 * Adapts the shared reaction row to the web: a visitor's press opens sign-up, and an error shows as a toast.
 */
export function ReactionRow(props: ReactionRowAdapterProps) {
	const navigate = useNavigate()
	return (
		<SharedReactionRow
			{...props}
			onSignIn={() => void navigate(toSignupNavigation("reaction"))}
			onError={toast.error}
			elements={SOCIAL_ELEMENTS}
		/>
	)
}
