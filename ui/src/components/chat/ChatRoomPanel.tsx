// the chat room panel: one shared conversation streaming live, clearable by a leader alone
import type { ChatRoomMessage } from "@shared/contracts"
import { X } from "lucide-react"
import { lazy, Suspense, useEffect, useState } from "react"
import { authClient } from "@/clients/authClient"
import { sendChatMentionsViewed, sendClearChatRoom, sendDeleteChatRoomAttachment } from "@/clients/chatRoomClient"
import { fetchTeamPage } from "@/clients/teamClient"
import { ChatCallToActionPanel } from "@/components/chat/ChatCallToActionPanel"
import type { ChatRoomOption } from "@/components/chat/ChatOptionsMenu"
import {
	ChatMessagesLoading,
	ChatPanelHeader,
	type ChatPanelTooltip,
	ChatPanelWidget,
	renderOnTop,
} from "@/components/chat/ChatPanelWidget"
import { ChatRoomComposer, DisabledRoomComposer } from "@/components/chat/ChatRoomComposer"
import { ClearChatDialog } from "@/components/chat/ClearChatDialog"
import { useChatRoom } from "@/components/chat/useChatRoom"
import type { ChatPanelState } from "@/stores/chatPanelStore"
import { markChatRoomOpened } from "@/stores/chatRoomStore"

// the message list is lazy-loaded on the first open instead of with the page
const ChatRoomMessages = lazy(() =>
	import("@/components/chat/ChatRoomMessages").then((messages) => ({ default: messages.ChatRoomMessages })),
)

// the team's active members for the @ autocomplete, plus whether the user leads it
function useRoomMembers(teamId: string, userId: string | undefined): { memberUsernames: string[]; isLeader: boolean } {
	const [members, setMembers] = useState<{ userId: string; username: string }[]>([])
	const [isTeamLeader, setIsTeamLeader] = useState(false)
	useEffect(() => {
		let isStale = false
		fetchTeamPage(teamId)
			.then((teamPage) => {
				if (isStale) {
					return
				}
				const team = teamPage.status === "visible" ? teamPage.team : null
				const activeMembers = (team?.members ?? []).filter((member) => member.isActive)
				setMembers(activeMembers.map((member) => ({ userId: member.userId, username: member.username })))
				setIsTeamLeader(team?.role === "leader")
			})
			.catch(() => setMembers([]))
		return () => {
			isStale = true
		}
	}, [teamId])
	const memberUsernames = members
		.filter((member) => member.userId !== userId)
		.map((member) => member.username)
		.sort()
	return { memberUsernames, isLeader: isTeamLeader }
}

// the newest message to reply to. null for anything else
function toReplyMessage(messages: ChatRoomMessage[], userId: string): ChatRoomMessage | null {
	const newestMessage = messages.at(-1)
	if (!newestMessage || newestMessage.authorUserId === userId || newestMessage.replyToMessageId === null) {
		return null
	}
	const isAnsweringUser = messages.some(
		(message) => message.id === newestMessage.replyToMessageId && message.authorUserId === userId,
	)
	return isAnsweringUser ? newestMessage : null
}

/**
 * The shared chat room panel. A null topic is the team's own room.
 */
export function ChatRoomPanel({
	topicId,
	contextName,
	teamId,
	chatRoomOptions,
	panelState,
	onPanelState,
	onPrivateChat,
	onOpenMenu,
	onOpenChatRoom,
	joinButton,
}: {
	// null is the team's own room on its team page
	topicId: string | null
	// what the empty room's opening line names: the topic, or the team itself
	contextName: string
	teamId: string
	// every room the chat panel's menu can switch to, absent where there is only one option
	chatRoomOptions?: ChatRoomOption[]
	// how much of the screen the panel takes, owned by the shell so it survives a room switch
	panelState: Exclude<ChatPanelState, "collapsed">
	onPanelState: (next: ChatPanelState) => void
	// opens the user's own conversation about this topic, on a topic's room alone
	onPrivateChat?: () => void
	// re-reads the room list when the options menu opens
	onOpenMenu?: () => void
	// a callback to mark the chat room's mentions as seen
	onOpenChatRoom?: () => void
	// the Join Team button, shown in place of the conversation to someone who cannot see a team chat
	joinButton?: React.ReactNode
}) {
	// the reply message, the members for the autocomplete, and the chat room itself
	const [isClearChatOpen, setIsClearChatOpen] = useState(false)
	const [replyTo, setReplyTo] = useState<ChatRoomMessage | null>(null)
	// whether the reply message was auto-selected instead of tapped on a message
	const [isAutoReply, setIsAutoReply] = useState(false)
	const { data: session } = authClient.useSession()
	const chatRoom = useChatRoom(topicId, teamId)
	const { memberUsernames, isLeader } = useRoomMembers(teamId, session?.user.id)

	// an open panel is what counts as seeing a mention, which clears every badge for this room at once
	useEffect(() => {
		markChatRoomOpened(topicId, teamId)
		sendChatMentionsViewed(topicId, teamId).catch(() => {})
		onOpenChatRoom?.()
	}, [topicId, teamId, onOpenChatRoom])

	// the auto-selected reply message keeps an exchange going
	useEffect(() => {
		if (!chatRoom.isLoaded || !session || (replyTo !== null && !isAutoReply)) {
			return
		}
		const replyMessage = toReplyMessage(chatRoom.messages, session.user.id)
		if (replyMessage && replyMessage.id !== replyTo?.id) {
			setReplyTo(replyMessage)
			setIsAutoReply(true)
			return
		}
		// anything else clears a stale auto-selected reply message, so the menu reads @all again
		if (!replyMessage && replyTo !== null && isAutoReply) {
			setReplyTo(null)
		}
	}, [chatRoom.isLoaded, chatRoom.messages, session, replyTo, isAutoReply])

	// each other author's latest message, newest first, for the composer's reply to menu
	const latestMessageByUsername = new Map<string, ChatRoomMessage>()
	for (const message of chatRoom.messages) {
		if (message.authorUserId !== session?.user.id) {
			latestMessageByUsername.set(message.authorUsername, message)
		}
	}
	const replyMessages = [...latestMessageByUsername.values()]
		.reverse()
		.map((message) => ({ username: message.authorUsername, message }))

	// a user who does not have access to the chat room gets a call to action button instead
	if (chatRoom.isRefused && !joinButton) {
		return null
	}

	// "open" and "enlarged" render the same panel, sized by the flag
	const isPanelEnlarged = panelState === "enlarged"

	// the menu's own row for this room names its team, so the title's tooltip shows the same avatar
	const currentChatRoom = chatRoomOptions?.find((chatRoomOption) => chatRoomOption.isActive)
	const chatPanelTooltip: ChatPanelTooltip = {
		chatRoomName: currentChatRoom?.name ?? contextName,
		team: currentChatRoom?.team,
	}

	// a chat room the user does not have access to gets a call to action button instead
	if (chatRoom.isRefused) {
		return (
			<ChatCallToActionPanel
				isEnlarged={isPanelEnlarged}
				onPanelState={onPanelState}
				chatPanelTooltip={chatPanelTooltip}
				menu={{ chatRoomOptions, onPrivateChat, onOpenMenu }}
				actionLine="Join this team to start the conversation"
			>
				{joinButton}
			</ChatCallToActionPanel>
		)
	}

	// the clear chat option is the team leader's alone. an empty room has nothing to clear.
	const isClearable = isLeader && chatRoom.messages.length > 0
	return renderOnTop(
		<ChatPanelWidget isEnlarged={isPanelEnlarged} onMinimizeChat={() => onPanelState("collapsed")}>
			<ChatPanelHeader
				isEnlarged={isPanelEnlarged}
				isRoom
				onToggleSize={() => onPanelState(isPanelEnlarged ? "open" : "enlarged")}
				onCollapse={() => onPanelState("collapsed")}
				chatPanelTooltip={chatPanelTooltip}
				chatRoomMenu={{
					chatRoomOptions,
					onPrivateChat,
					onOpenMenu,
					onClear: isClearable ? () => setIsClearChatOpen(true) : undefined,
					clearLabel: `Clear ${contextName} chat`,
				}}
			/>
			{/* the chat panel stays on screen while another chat room loads */}
			{chatRoom.isLoaded ? (
				<Suspense fallback={<ChatMessagesLoading />}>
					<ChatRoomMessages
						isEnlarged={isPanelEnlarged}
						messages={chatRoom.messages}
						userId={session?.user.id ?? ""}
						isLeader={isLeader}
						isCarlThinking={chatRoom.isCarlThinking}
						topicName={contextName}
						topicId={topicId}
						teamId={teamId}
						onReplyMessage={(message) => {
							setReplyTo(message)
							setIsAutoReply(false)
						}}
						onDeleteAttachment={(attachmentId) => {
							// the stream never announces a removal, so the chat messages re-read after it
							void sendDeleteChatRoomAttachment(topicId, teamId, attachmentId)
								.then(() => chatRoom.refresh())
								.catch((error) => console.error("delete chat room attachment failed", error))
						}}
					/>
				</Suspense>
			) : (
				<ChatMessagesLoading />
			)}

			{/* a budget refusal is private to the poster, shown here instead of posted to the room */}
			{chatRoom.refusalReason && (
				<div className="text-muted-foreground flex shrink-0 items-start justify-between gap-2 border-t px-3 py-2 text-xs">
					<span>{chatRoom.refusalReason}</span>
					<button
						type="button"
						aria-label="Dismiss"
						onClick={chatRoom.clearRefusalReason}
						className="hover:text-foreground shrink-0"
					>
						<X className="size-3.5" />
					</button>
				</div>
			)}
			{chatRoom.isLoaded ? (
				<ChatRoomComposer
					memberUsernames={memberUsernames}
					replyTo={replyTo}
					isAutoReply={isAutoReply}
					replyMessages={replyMessages}
					onSelectReplyMessage={(chatRoomMessage) => {
						setReplyTo(chatRoomMessage)
						setIsAutoReply(false)
					}}
					onSendMessage={(content, replyToMessageId, attachments) => {
						// the send includes the reply message that the composer resolved and the pending attachment files
						void chatRoom.send(content, replyToMessageId, attachments)
						setReplyTo(null)
					}}
				/>
			) : (
				<DisabledRoomComposer />
			)}

			{/* the clear chat confirmation is only mounted while open, so its state resets each time */}
			{isClearChatOpen && (
				<ClearChatDialog
					onConfirm={async () => {
						// the re-read empties the chat messages. the stream never announces a clear
						const isChatCleared = await sendClearChatRoom(topicId, teamId)
						if (isChatCleared) {
							await chatRoom.refresh()
						}
						return isChatCleared
					}}
					onClose={() => setIsClearChatOpen(false)}
				>
					{"This clears the whole conversation for every member of the team, and the attachment files are deleted too."}
				</ClearChatDialog>
			)}
		</ChatPanelWidget>,
	)
}
