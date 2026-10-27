import { useLocalSearchParams } from "expo-router"
import { ChatScreen } from "@/components/chat/ChatScreen"

/**
 * Opens the Team's shared room and private chat.
 */
export default function TeamChatScreen() {
	const { teamId } = useLocalSearchParams<{ teamId: string }>()
	return <ChatScreen teamId={teamId} />
}
