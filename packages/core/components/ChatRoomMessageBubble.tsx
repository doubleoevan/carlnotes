import type { ChatRoomMessage } from "@carlnotes/contracts/chat"
import { isModelChatMessage } from "@carlnotes/contracts/chatMentions"
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"
import type { ComponentType, ReactNode } from "react"
import type { ChatAuthorProps } from "./ChatAuthor"

export type ChatRoomMessageBubbleProps = {
	chatMessage: ChatRoomMessage
	// null is the team's own chat room, whose files download from the team routes
	topicId: string | null
	teamId: string
	repliedChatMessage: ChatRoomMessage | undefined
	isOwnChatMessage: boolean
	now: number
	// the page carl's play button names, null while voice is off
	voiceChatPage: VoiceChatPage | null
	// the chat message's author and a team leader may remove it and its shared files
	canDelete: boolean
	// true while this fresh chat message's link preview cards are still loading
	isLinkPreviewLoading: boolean
	onReply: (chatMessage: ChatRoomMessage) => void
	// scrolls the chat messages back to the quoted chat message
	onQuoteClick: (chatMessageId: number) => void
	onAttachmentDelete: (attachmentId: string) => void
	onDeleteChatMessage: (chatMessageId: number) => void
}
export type ChatRoomMessageElements = {
	Author: ComponentType<ChatAuthorProps>
	Frame: ComponentType<{ children: ReactNode; isOwn: boolean }>
	Quote: ComponentType<{ message: ChatRoomMessage; onSelect: (id: number) => void }>
	Body: ComponentType<{ content: string; isOwn: boolean; isModel: boolean }>
	Previews: ComponentType<{ previews: ChatRoomMessage["linkPreviews"]; isLoading: boolean }>
	Attachments: ComponentType<ChatRoomMessageBubbleProps>
	Footer: ComponentType<ChatRoomMessageBubbleProps & { isModel: boolean }>
}

/**
 * Keeps room authors, quotes, answer formatting and action order in one shared composition.
 */
export function ChatRoomMessageBubble({
	elements: { Author, Frame, Quote, Body, Previews, Attachments, Footer },
	...props
}: ChatRoomMessageBubbleProps & { elements: ChatRoomMessageElements }) {
	// read the message author and rendering state
	const { chatMessage, isOwnChatMessage, repliedChatMessage, onQuoteClick, isLinkPreviewLoading } = props
	const isModel = isModelChatMessage(chatMessage)
	return (
		<Author
			authorUserId={chatMessage.authorUserId}
			authorUsername={chatMessage.authorUsername}
			avatarVersion={chatMessage.authorAvatarVersion}
			isOwnChatMessage={isOwnChatMessage}
		>
			<Frame isOwn={isOwnChatMessage}>
				{/* quote and message */}
				{repliedChatMessage && <Quote message={repliedChatMessage} onSelect={onQuoteClick} />}
				<Body content={chatMessage.content} isOwn={isOwnChatMessage} isModel={isModel} />
				{/* previews and attachments */}
				<Previews previews={chatMessage.linkPreviews} isLoading={isLinkPreviewLoading} />
				<Attachments {...props} />
				{/* message actions */}
				<Footer {...props} isModel={isModel} />
			</Frame>
		</Author>
	)
}
