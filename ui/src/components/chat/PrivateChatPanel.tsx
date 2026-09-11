import { lazy, Suspense, useState } from "react"
import { useNavigate } from "react-router-dom"
import { authClient } from "@/clients/authClient"
import type { ChatPage } from "@/clients/chatClient"
import { ChatBudgetNotice } from "@/components/chat/ChatBudgetNotice"
import { CHAT_QUESTION_PLACEHOLDER, ChatComposer } from "@/components/chat/ChatComposer"
import type { ChatRoomOption } from "@/components/chat/ChatOptionsMenu"
import { ChatMessagesLoading, ChatPanelHeader, ChatPanelWidget, renderOnTop } from "@/components/chat/ChatPanelWidget"
import { DisabledRoomComposer } from "@/components/chat/ChatRoomComposer"
import { ChatTopicLimitNotice } from "@/components/chat/ChatTopicLimitNotice"
import { ClearChatDialog } from "@/components/chat/ClearChatDialog"
import { TopicDraftCard } from "@/components/chat/TopicDraftCard"
import { type TopicChat, useTopicChat } from "@/components/chat/useTopicChat"
import type { ChatPanelState } from "@/stores/chatPanelStore"

// the chat message list is lazy-loaded on the first open instead of in the initial bundle
const ChatMessages = lazy(() =>
	import("@/components/chat/ChatMessages").then((chatMessages) => ({ default: chatMessages.ChatMessages })),
)

// the empty question box's line in the new-topic chat: carl asks for the first topic, then for the next
const FIRST_TOPIC_PLACEHOLDER = "Let's make your first topic. You know the one."
const NEW_TOPIC_PLACEHOLDER = "Let's make a topic. You know the one."

// what an empty new-topic chat opens with
const NEW_TOPIC_OPENING_LINE = "Tell me what you want to keep up with. I'll shape it into a topic."

// the words the panel shows for a conversation: the private chat's, or the new-topic chat's
function toChatCopy(
	page: ChatPage,
	isFirstTopic: boolean,
): { headerName: string; placeholder: string; openingLine?: string; clearNote: string } {
	if (!page.newTopic) {
		return {
			headerName: "Private chat",
			placeholder: CHAT_QUESTION_PLACEHOLDER,
			clearNote: "Carl forgets this whole conversation.",
		}
	}
	return {
		headerName: "Give Carl a topic. You know the one.",
		placeholder: isFirstTopic ? FIRST_TOPIC_PLACEHOLDER : NEW_TOPIC_PLACEHOLDER,
		openingLine: NEW_TOPIC_OPENING_LINE,
		clearNote: "Carl forgets this whole conversation.",
	}
}

// the composer, a disabled box while the conversation loads, or the upgrade link when the budget is spent
function PrivateChatComposer({
	chat,
	placeholder,
	onSendQuestion,
}: {
	chat: TopicChat
	placeholder: string
	onSendQuestion: () => void
}) {
	if (!chat.isLoaded) {
		return <DisabledRoomComposer placeholder={placeholder} />
	}
	if (chat.isBudgetExhausted) {
		return (
			<div className="border-t px-3 py-3">
				<ChatBudgetNotice />
			</div>
		)
	}
	return <ChatComposer chat={chat} onSendQuestion={onSendQuestion} placeholder={placeholder} />
}

// above the new-topic chat's composer: the plan's limit when it holds no more topics, else carl's draft
function TopicDraftOrLimitNotice({ chat }: { chat: TopicChat }) {
	if (chat.topicsRemaining === 0 && chat.topicLimit !== null) {
		return <ChatTopicLimitNotice topicLimit={chat.topicLimit} />
	}
	return (
		<TopicDraftCard
			topicDraft={chat.topicDraft}
			attachmentFiles={chat.topicDraftAttachmentFiles}
			onRemoveAttachmentFile={chat.removeTopicDraftAttachmentFile}
		/>
	)
}

// the private chat panel: one user, one persisted conversation with Carl, clearable
export function PrivateChatPanel({
	page,
	chatName,
	panelState,
	onPanelState,
	chatRoomOptions,
	onOpenMenu: onOpenChatRoomMenu,
	onNewTopicChat,
}: {
	// the conversation's page: one topic, or a whole team read across its topics
	page: ChatPage
	// what the empty conversation's opening line names: the topic, or the team
	chatName: string
	// how much of the screen the panel takes, owned by the shell so it survives a chat room switch
	panelState: Exclude<ChatPanelState, "collapsed">
	onPanelState: (next: ChatPanelState) => void
	// the chat rooms the menu offers beside this conversation
	chatRoomOptions?: ChatRoomOption[]
	// re-reads the chat room list when the options menu opens
	onOpenMenu?: () => void
	// opens the new-topic chat from the menu. the shell leaves it out while this is that chat
	onNewTopicChat?: () => void
}) {
	// the router a visitor's send to signup needs, and the conversation state the hook owns
	const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false)
	const navigate = useNavigate()
	const chat = useTopicChat(page)
	// the user authors every question bubble
	const { data: session } = authClient.useSession()

	// a visitor navigates to the signup on send
	const handleSendChat = chat.isSignupRequired ? () => navigate("/signup") : chat.send

	// a user with no way forward gets no panel, but a logged-out visitor or a user with an exhausted budget still
	if (chat.isLoaded && !chat.canChat && !chat.isSignupRequired && !chat.isBudgetExhausted) {
		return null
	}

	// pick the panel's words: the new-topic chat's line for the question box, else the private chat's
	const chatCopy = toChatCopy(page, chat.isFirstTopic)

	// "open" and "enlarged" render the same panel, sized by the flag
	const isPanelEnlarged = panelState === "enlarged"
	const isClearable = (chat.canChat || chat.isBudgetExhausted) && chat.chatTurns.length > 0
	return renderOnTop(
		<ChatPanelWidget isEnlarged={isPanelEnlarged} onMinimizeChat={() => onPanelState("collapsed")}>
			<ChatPanelHeader
				isEnlarged={isPanelEnlarged}
				onToggleSize={() => onPanelState(isPanelEnlarged ? "open" : "enlarged")}
				onCollapse={() => onPanelState("collapsed")}
				currentChatRoom={{ name: chatCopy.headerName, isPrivate: true }}
				chatRoomMenu={{
					chatRoomOptions,
					onOpenChatRoomMenu,
					onNewTopicChat,
					onClear: isClearable ? () => setIsClearConfirmOpen(true) : undefined,
					clearLabel: "Clear private chat",
				}}
			/>
			{/* the frame stays on screen while the conversation loads, so opening the panel pours into it */}
			{chat.isLoaded ? (
				<Suspense fallback={<ChatMessagesLoading />}>
					<ChatMessages
						isEnlarged={isPanelEnlarged}
						chatTurns={chat.chatTurns}
						isStreaming={chat.isStreaming}
						chatName={chatName}
						openingLine={chatCopy.openingLine}
						isBudgetExhausted={chat.isBudgetExhausted}
						onRetry={(question) => void chat.send(question)}
						author={{
							userId: session?.user.id ?? null,
							username: session?.user.username ?? "you",
							avatarSource: session?.user.avatarSource ?? null,
						}}
					/>
				</Suspense>
			) : (
				<ChatMessagesLoading />
			)}
			{/* carl's draft above the composer, or the plan's limit when it holds no more topics */}
			{page.newTopic && <TopicDraftOrLimitNotice chat={chat} />}
			<PrivateChatComposer chat={chat} placeholder={chatCopy.placeholder} onSendQuestion={handleSendChat} />

			{/* the clear confirmation is only mounted while open, so its state resets each time */}
			{isClearConfirmOpen && (
				<ClearChatDialog onConfirm={chat.clear} onClose={() => setIsClearConfirmOpen(false)}>
					{chatCopy.clearNote}
				</ClearChatDialog>
			)}
		</ChatPanelWidget>,
	)
}
