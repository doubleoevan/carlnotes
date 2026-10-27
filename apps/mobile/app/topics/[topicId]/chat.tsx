import { useLocalSearchParams } from "expo-router"
import { ChatScreen } from "@/components/chat/ChatScreen"

/**
 * Opens chat for the Topic in this route.
 */
export default function TopicChatScreen() {
	const { topicId } = useLocalSearchParams<{ topicId: string }>()
	return <ChatScreen topicId={topicId} />
}
