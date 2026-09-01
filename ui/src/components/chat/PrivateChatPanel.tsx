import { lazy, Suspense, useState } from "react"
import { useNavigate } from "react-router-dom"
import { authClient } from "@/clients/authClient"
import type { ChatPage } from "@/clients/chatClient"
import { ChatBudgetNotice } from "@/components/chat/ChatBudgetNotice"
import { CHAT_QUESTION_PLACEHOLDER, ChatComposer } from "@/components/chat/ChatComposer"
import type { ChatRoomOption } from "@/components/chat/ChatOptionsMenu"
import { ChatMessagesLoading, ChatPanelHeader, ChatPanelWidget, renderOnTop } from "@/components/chat/ChatPanelWidget"
import { DisabledRoomComposer } from "@/components/chat/ChatRoomComposer"
import { ClearChatDialog } from "@/components/chat/ClearChatDialog"
import { useTopicChat } from "@/components/chat/useTopicChat"
import type { ChatPanelState } from "@/stores/chatPanelStore"

// the chat message list is lazy-loaded on the first open instead of in the initial bundle
const ChatMessages = lazy(() =>
	import("@/components/chat/ChatMessages").then((chatMessages) => ({ default: chatMessages.ChatMessages })),
)

// the private chat panel: one user, one persisted conversation with Carl, clearable
export function PrivateChatPanel({
	page,
	chatName,
	panelState,
	onPanelState,
	chatRoomOptions,
	onOpenMenu: onOpenChatRoomMenu,
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

	// "open" and "enlarged" render the same panel, sized by the flag
	const isPanelEnlarged = panelState === "enlarged"
	const isClearable = (chat.canChat || chat.isBudgetExhausted) && chat.chatTurns.length > 0
	return renderOnTop(
		<ChatPanelWidget isEnlarged={isPanelEnlarged} onMinimizeChat={() => onPanelState("collapsed")}>
			<ChatPanelHeader
				isEnlarged={isPanelEnlarged}
				onToggleSize={() => onPanelState(isPanelEnlarged ? "open" : "enlarged")}
				onCollapse={() => onPanelState("collapsed")}
				currentChatRoom={{ name: "Private chat", isPrivate: true }}
				chatRoomMenu={{
					chatRoomOptions,
					onOpenChatRoomMenu,
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
			{/* if the user is out of budget, they see an upgrade link instead of the composer input */}
			{!chat.isLoaded ? (
				<DisabledRoomComposer placeholder={CHAT_QUESTION_PLACEHOLDER} />
			) : chat.isBudgetExhausted ? (
				<div className="border-t px-3 py-3">
					<ChatBudgetNotice />
				</div>
			) : (
				<ChatComposer chat={chat} onSendQuestion={handleSendChat} />
			)}

			{/* the clear confirmation is only mounted while open, so its state resets each time */}
			{isClearConfirmOpen && (
				<ClearChatDialog onConfirm={chat.clear} onClose={() => setIsClearConfirmOpen(false)}>
					{"Carl forgets this whole conversation, and the files you attached go too."}
				</ClearChatDialog>
			)}
		</ChatPanelWidget>,
	)
}
