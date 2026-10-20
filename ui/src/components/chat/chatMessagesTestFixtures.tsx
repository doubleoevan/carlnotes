// the private chat's message list as the chat tests render it, for one user
import type { VoiceChatPage } from "@shared/payloads"
import { ChatMessages } from "./ChatMessages"
import type { ChatTurn } from "./chatTurns"
import { renderWithRouter } from "./renderWithRouter"

// the user whose questions the private chat renders
const TEST_CHAT_AUTHOR = { userId: "user-1", username: "ana", avatarVersion: null }

// the voice chat page each answer's play button names, null for voice off, and the retry on a failure notice
type RenderTestChatMessagesOptions = {
	voiceChatPage?: VoiceChatPage | null
	onRetry?: (question: string) => void
}

/**
 * Returns the private chat's message list of these chat turns as HTML, for the user ana, with voice off unless a voice
 * chat page is given.
 */
export function renderTestChatMessages(
	chatTurns: ChatTurn[],
	{ voiceChatPage = null, onRetry }: RenderTestChatMessagesOptions = {},
): Promise<string> {
	return renderWithRouter(
		<ChatMessages
			chatTurns={chatTurns}
			isEnlarged={false}
			isStreaming={false}
			chatName="topic"
			author={TEST_CHAT_AUTHOR}
			voiceChatPage={voiceChatPage}
			onRetry={onRetry}
		/>,
	)
}
