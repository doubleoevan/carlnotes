import { sendDeleteJoinRequest, sendJoinRequest } from "@carlnotes/client/teamClient"
import { toTeamPath } from "@carlnotes/contracts/seo"
import { Minus, Plus } from "lucide-react-native"
import { Alert, View } from "react-native"
import { hasSession } from "@/authClient"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { usePageMutation } from "@/hooks/usePageMutation"
import {
	HIGHLIGHTED_PAGE_BUTTON_CLASS,
	PLAIN_PAGE_BUTTON_CLASS,
	PLAIN_PAGE_BUTTON_ICON_CLASS,
	PLAIN_PAGE_BUTTON_TEXT_CLASS,
} from "@/pageButtonClasses"
import { openSessionScreen } from "@/sessionReturnPath"

/**
 * Requests or withdraws team membership using the web's join flow.
 */
export function JoinTeamButton({
	teamId,
	name,
	hasRequestedToJoin,
	onChanged,
	isHighlighted = true,
}: {
	teamId: string
	name: string
	hasRequestedToJoin: boolean
	onChanged: () => void
	isHighlighted?: boolean
}) {
	const mutation = usePageMutation(onChanged)
	return (
		<View className="gap-2">
			<Button
				variant={isHighlighted ? "default" : "outline"}
				className={isHighlighted ? HIGHLIGHTED_PAGE_BUTTON_CLASS : PLAIN_PAGE_BUTTON_CLASS}
				accessibilityLabel={hasRequestedToJoin ? `Delete request to join ${name}` : `Ask to join ${name}`}
				disabled={mutation.isPending}
				onPress={() => {
					if (!hasSession()) {
						openSessionScreen({ screen: "/sign-up", returnPath: toTeamPath(teamId), cta: "team-join" })
						return
					}
					void mutation.run(async () => {
						if (hasRequestedToJoin) {
							await sendDeleteJoinRequest(teamId)
						} else {
							if (!(await sendJoinRequest(teamId))) {
								throw new Error("That request didn't go through. Try again.")
							}
							Alert.alert(`You've asked to join ${name}.`, "A team leader can add you.")
						}
					})
				}}
			>
				{/* the plain button's icon alone takes the highlight color */}
				<Icon
					as={hasRequestedToJoin ? Minus : Plus}
					className={isHighlighted ? "size-4" : PLAIN_PAGE_BUTTON_ICON_CLASS}
				/>
				<Text className={isHighlighted ? undefined : PLAIN_PAGE_BUTTON_TEXT_CLASS}>Join Team</Text>
			</Button>
			{mutation.error && <Text className="text-sm text-destructive">{mutation.error}</Text>}
		</View>
	)
}
