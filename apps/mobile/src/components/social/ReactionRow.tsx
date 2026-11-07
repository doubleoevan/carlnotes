import { showClientError } from "@carlnotes/client/apiClient"
import { type ReactionRowAdapterProps, ReactionRow as SharedReactionRow } from "@carlnotes/core/components/ReactionRow"
import { usePathname } from "expo-router"
import { openSessionScreen } from "@/sessionReturnPath"
import { SOCIAL_ELEMENTS } from "./socialElements"

/**
 * Adapts the shared reaction row to the mobile app: a visitor's press opens sign-up and returns to this screen, and an
 * error shows the way the app shows one.
 */
export function ReactionRow(props: ReactionRowAdapterProps) {
	const pathname = usePathname()
	return (
		<SharedReactionRow
			{...props}
			onSignIn={() => openSessionScreen({ screen: "/sign-up", returnPath: pathname, cta: "reaction" })}
			onError={showClientError}
			elements={SOCIAL_ELEMENTS}
		/>
	)
}
