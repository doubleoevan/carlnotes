import { useLocalSearchParams } from "expo-router"
import { ChatScreen } from "@/components/chat/ChatScreen"

/**
 * Opens chat for the Topic in this route, on the team room a badge named when it names one, on the private chat that
 * edits the Topic with Carl, or on the private chat the chat launcher on a Topic Post's screen asked for.
 */
export default function TopicChatScreen() {
	const { topicId, chatTeamId, editTopic, privateChat } = useLocalSearchParams<{
		topicId: string
		chatTeamId?: string
		editTopic?: string
		privateChat?: string
	}>()
	return (
		<ChatScreen
			topicId={topicId}
			chatTeamId={chatTeamId}
			isEditingTopic={editTopic === "true"}
			isPrivateChat={privateChat === "true"}
		/>
	)
}
