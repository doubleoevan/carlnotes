import { useLocalSearchParams } from "expo-router"
import { ChatScreen } from "@/components/chat/ChatScreen"

/**
 * Opens chat from screens without a Topic or Team context.
 */
export default function GlobalChatScreen() {
	const { profileUserId } = useLocalSearchParams<{ profileUserId?: string }>()
	return <ChatScreen profileUserId={profileUserId} />
}
