import { authClient } from "@carlnotes/client/authClient"
import type { ChatPage } from "@carlnotes/client/chatClient"
import { toAvatarVersion } from "@carlnotes/contracts/avatars"
import { CLEAR_CHAT_COPY, NEW_TOPIC_CHAT_COPY } from "@carlnotes/core/lib/chatCopy"
import { useNavigate } from "@tanstack/react-router"
import { lazy, Suspense, useState } from "react"
import { toSignupNavigation } from "@/components/session/signupPrompts"
import { type ChatPanelState, clearProposedTopicEdit } from "@/stores/chatPanelStore"
import { ChatBudgetNotice } from "./ChatBudgetNotice"
import { CHAT_QUESTION_PLACEHOLDER, ChatComposer } from "./ChatComposer"
import type { ChatRoomOption } from "./ChatOptionsMenu"
import { ChatMessagesLoading, ChatPanelWidget } from "./ChatPanelWidget"
import { DisabledRoomComposer } from "./ChatRoomComposer"
import { ChatTopicLimitNotice } from "./ChatTopicLimitNotice"
import { ClearChatDialog } from "./ClearChatDialog"
import { TopicDraftCard } from "./TopicDraftCard"
import { type TopicChat, useTopicChat } from "./useTopicChat"

// the chat message list is lazy-loaded on the first open instead of in the initial bundle
const ChatMessages = lazy(() =>
	import("./ChatMessages").then((chatMessages) => ({ default: chatMessages.ChatMessages })),
)

// the words the panel shows for a conversation: the private chat's, or the new-topic chat's
function toChatCopy(
	page: ChatPage,
	isFirstTopic: boolean,
): { headerName: string; placeholder: string; openingLine?: string; clearNote: string } {
	if (!page.newTopic) {
		return {
			headerName: "Private chat",
			placeholder: CHAT_QUESTION_PLACEHOLDER,
			clearNote: CLEAR_CHAT_COPY.private,
		}
	}
	return {
		headerName: NEW_TOPIC_CHAT_COPY.name,
		placeholder: isFirstTopic ? NEW_TOPIC_CHAT_COPY.firstTopicPlaceholder : NEW_TOPIC_CHAT_COPY.placeholder,
		openingLine: NEW_TOPIC_CHAT_COPY.openingLine,
		clearNote: CLEAR_CHAT_COPY.private,
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
			isCarlReplying={chat.isStreaming}
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
	onPanelState: (nextPanelState: ChatPanelState) => void
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
	const { data: session } = authClient().useSession()

	// a visitor's send opens the signup page, tagged as a signup from the chat
	const handleSendChat = chat.isSignupRequired ? () => navigate(toSignupNavigation("chat")) : chat.send

	// a user with no way forward gets no panel, but a logged-out visitor or a user with an exhausted budget still
	if (chat.isLoaded && !chat.canChat && !chat.isSignupRequired && !chat.isBudgetExhausted) {
		return null
	}

	// pick the panel's words: the new-topic chat's line for the question box, else the private chat's
	const chatCopy = toChatCopy(page, chat.isFirstTopic)

	// "open" and "enlarged" render the same panel, sized by the flag
	const isPanelEnlarged = panelState === "enlarged"
	const isClearable = (chat.canChat || chat.isBudgetExhausted) && chat.chatTurns.length > 0
	return (
		<ChatPanelWidget
			isEnlarged={isPanelEnlarged}
			onPanelState={onPanelState}
			currentChatRoom={{ name: chatCopy.headerName, isPrivate: true }}
			chatRoomMenu={{
				chatRoomOptions,
				onOpenChatRoomMenu,
				onNewTopicChat,
				onClear: isClearable ? () => setIsClearConfirmOpen(true) : undefined,
				clearLabel: "Clear private chat",
			}}
		>
			{/* the chat messages, or the loading message while the conversation loads */}
			{chat.isLoaded ? (
				<Suspense fallback={<ChatMessagesLoading />}>
					<ChatMessages
						isEnlarged={isPanelEnlarged}
						chatTurns={chat.chatTurns}
						isStreaming={chat.isStreaming}
						chatName={chatName}
						openingLine={chatCopy.openingLine}
						isBudgetExhausted={chat.isBudgetExhausted}
						voiceChatPage={chat.voiceChatPage}
						onRetry={(question) => void chat.send(question)}
						author={{
							userId: session?.user.id ?? null,
							username: session?.user.username ?? "you",
							avatarVersion: toAvatarVersion(session?.user ?? {}),
						}}
					/>
				</Suspense>
			) : (
				<ChatMessagesLoading />
			)}
			{/* carl's topic draft above the composer, or the topic limit notice if the plan has no topics left */}
			{page.newTopic && <TopicDraftOrLimitNotice chat={chat} />}
			{/* the topic this chat may edit, as it is saved or as carl proposed changing it */}
			{chat.editableTopicDraft && (
				<TopicDraftCard
					topicDraft={chat.editableTopicDraft.topicDraft}
					topicId={page.topicId}
					isTopicEditProposed={chat.editableTopicDraft.isTopicEditProposed}
					onDismissTopicEdit={clearProposedTopicEdit}
					isCarlReplying={chat.isStreaming}
				/>
			)}
			<PrivateChatComposer chat={chat} placeholder={chatCopy.placeholder} onSendQuestion={handleSendChat} />

			{/* the clear confirmation is only mounted while open, so its state resets each time */}
			{isClearConfirmOpen && (
				<ClearChatDialog onConfirm={chat.clear} onClose={() => setIsClearConfirmOpen(false)}>
					{chatCopy.clearNote}
				</ClearChatDialog>
			)}
		</ChatPanelWidget>
	)
}
