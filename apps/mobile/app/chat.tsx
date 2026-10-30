import { useLocalSearchParams } from "expo-router"
import { ChatScreen } from "@/components/chat/ChatScreen"
import { toNewTopicChatId } from "@/components/chat/chatNavigation"

/**
 * Opens chat from screens without a Topic or Team context, or straight on the new-topic chat.
 */
export default function GlobalChatScreen() {
	const { profileUserId, newTopic, initialTeamId } = useLocalSearchParams<{
		profileUserId?: string
		newTopic?: string
		initialTeamId?: string
	}>()
	return <ChatScreen profileUserId={profileUserId} newTopicChatId={toNewTopicChatId({ newTopic, initialTeamId })} />
}
