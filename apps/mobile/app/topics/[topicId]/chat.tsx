import { useLocalSearchParams } from "expo-router"
import { ChatScreen } from "@/components/chat/ChatScreen"

/**
 * Opens chat for the Topic in this route, on the team room a badge named when it names one, or on the private chat
 * that edits the Topic with Carl.
 */
export default function TopicChatScreen() {
	const { topicId, chatTeamId, editTopic } = useLocalSearchParams<{
		topicId: string
		chatTeamId?: string
		editTopic?: string
	}>()
	return <ChatScreen topicId={topicId} chatTeamId={chatTeamId} isEditingTopic={editTopic === "true"} />
}
