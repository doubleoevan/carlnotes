import { useLocalSearchParams } from "expo-router"
import { ChatScreen } from "@/components/chat/ChatScreen"

/**
 * Opens chat for the Topic in this route, on the team room a badge named when it names one.
 */
export default function TopicChatScreen() {
	const { topicId, chatTeamId } = useLocalSearchParams<{ topicId: string; chatTeamId?: string }>()
	return <ChatScreen topicId={topicId} chatTeamId={chatTeamId} />
}
