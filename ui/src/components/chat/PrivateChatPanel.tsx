import { lazy, Suspense, useState } from "react"
import { useNavigate } from "react-router-dom"
import { authClient } from "@/clients/authClient"
import { ChatBudgetNotice } from "@/components/chat/ChatBudgetNotice"
import { CHAT_QUESTION_PLACEHOLDER, ChatComposer } from "@/components/chat/ChatComposer"
import type { ChatRoomOption } from "@/components/chat/ChatOptionsMenu"
import { ChatMessagesLoading, ChatPanelHeader, ChatPanelWidget, renderOnTop } from "@/components/chat/ChatPanelWidget"
import { DisabledRoomComposer } from "@/components/chat/ChatRoomComposer"
import { ClearChatDialog } from "@/components/chat/ClearChatDialog"
import { useTopicChat } from "@/components/chat/useTopicChat"
import type { ChatPanelState } from "@/stores/chatPanelStore"

// the message list is lazy-loaded on the first open instead of with the page
const ChatMessages = lazy(() =>
	import("@/components/chat/ChatMessages").then((messages) => ({ default: messages.ChatMessages })),
)

// the private chat panel: one user, one persisted conversation with Carl, clearable
export function PrivateChatPanel({
	topicId,
	topicName,
	panelState,
	onPanelState,
	chatRoomOptions,
	onOpenMenu,
}: {
	topicId: string
	topicName: string
	// how much of the screen the panel takes, owned by the shell so it survives a room switch
	panelState: Exclude<ChatPanelState, "collapsed">
	onPanelState: (next: ChatPanelState) => void
	// the rooms the menu offers beside this conversation
	chatRoomOptions?: ChatRoomOption[]
	// re-reads the room list when the options menu opens
	onOpenMenu?: () => void
}) {
	// the router a visitor's send to signup needs, and the conversation state the hook owns
	const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false)
	const navigate = useNavigate()
	const chat = useTopicChat(topicId)
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
				chatPanelTooltip={{ chatRoomName: "Private chat", isPrivate: true }}
				chatRoomMenu={{
					chatRoomOptions,
					onOpenMenu,
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
						topicName={topicName}
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
				<ChatComposer
					question={chat.question}
					attachments={chat.attachments}
					keptAttachments={chat.keptAttachments}
					isStreaming={chat.isStreaming}
					isSignupRequired={chat.isSignupRequired}
					onChange={chat.setQuestion}
					onAddFiles={chat.addFiles}
					onAddPastedText={chat.addPastedText}
					onRemoveAttachment={chat.removeAttachment}
					onRemoveKeptAttachment={chat.removeKeptAttachment}
					onSend={handleSendChat}
					onStop={chat.stop}
				/>
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
