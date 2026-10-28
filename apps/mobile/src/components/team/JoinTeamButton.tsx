import { sendDeleteJoinRequest, sendJoinRequest } from "@carlnotes/client/teamClient"
import { router } from "expo-router"
import { Minus, Plus } from "lucide-react-native"
import { Alert, View } from "react-native"
import { hasSession } from "@/authClient"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { usePageMutation } from "@/hooks/usePageMutation"

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
				accessibilityLabel={hasRequestedToJoin ? `Delete request to join ${name}` : `Ask to join ${name}`}
				disabled={mutation.isPending}
				onPress={() => {
					if (!hasSession()) {
						router.push("/sign-up")
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
				<Icon as={hasRequestedToJoin ? Minus : Plus} className="size-4" />
				<Text>Join Team</Text>
			</Button>
			{mutation.error && <Text className="text-sm text-destructive">{mutation.error}</Text>}
		</View>
	)
}
