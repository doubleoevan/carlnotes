// the chat room panel: one shared conversation streaming live, clearable by a leader alone
import { X } from "lucide-react"
import { lazy, Suspense, useEffect, useState } from "react"
import { authClient } from "@/clients/authClient"
import { sendChatMentionsViewed, sendClearChatRoom } from "@/clients/chatRoomClient"
import { fetchTeamPage } from "@/clients/teamClient"
import { ChatBudgetNotice } from "@/components/chat/ChatBudgetNotice"
import { ChatCallToActionPanel } from "@/components/chat/ChatCallToActionPanel"
import type { ChatRoomMenu } from "@/components/chat/ChatOptionsMenu"
import {
	ChatMessagesLoading,
	type ChatPanelCurrentRoom,
	ChatPanelHeader,
	ChatPanelWidget,
	renderOnTop,
} from "@/components/chat/ChatPanelWidget"
import { ChatRoomComposer, DisabledRoomComposer } from "@/components/chat/ChatRoomComposer"
import { ClearChatDialog } from "@/components/chat/ClearChatDialog"
import { useChatRoom } from "@/components/chat/useChatRoom"
import { useRoomReply } from "@/components/chat/useRoomReply"
import type { ChatPanelState } from "@/stores/chatPanelStore"
import { markChatRoomOpened } from "@/stores/chatRoomStore"

// the chat message list is lazy-loaded on the first open instead of with the page
const ChatRoomMessages = lazy(() =>
	import("@/components/chat/ChatRoomMessages").then((chatMessages) => ({ default: chatMessages.ChatRoomMessages })),
)

// the team's active members for the @ autocomplete, plus whether the user leads it
function useRoomMembers(
	teamId: string,
	userId: string | undefined,
): { memberUsernames: string[]; isTeamLeader: boolean } {
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
	return { memberUsernames, isTeamLeader: isTeamLeader }
}

/**
 * The shared chat room panel. A null topic is the team's own chat room.
 */
export function ChatRoomPanel({
	topicId,
	contextName,
	teamId,
	chatRoomMenu,
	panelState,
	onPanelState,
	onOpenChatRoom,
	joinButton,
}: {
	// null is the team's own chat room on its team page
	topicId: string | null
	// what the empty chat room's opening line names: the topic, or the team itself
	contextName: string
	teamId: string
	// the chat rooms this panel's menu shows and its callbacks
	chatRoomMenu: ChatRoomMenu
	// how much of the screen the panel takes, owned by the shell so it survives a chat room switch
	panelState: Exclude<ChatPanelState, "collapsed">
	onPanelState: (next: ChatPanelState) => void
	// a callback to mark the chat room's mentions as seen
	onOpenChatRoom?: () => void
	// the Join Team button, shown in place of the conversation to someone who cannot see a team chat
	joinButton?: React.ReactNode
}) {
	// the chat members for the autocomplete, the chat room itself, and which chat message the composer answers
	const [isClearChatOpen, setIsClearChatOpen] = useState(false)
	const { data: session } = authClient.useSession()
	const chatRoom = useChatRoom(topicId, teamId)
	const { memberUsernames, isTeamLeader } = useRoomMembers(teamId, session?.user.id)

	// an admin moderates every chat room, the same way the header decides its admin console link
	const isAdmin = session?.user.role === "admin"
	const reply = useRoomReply(chatRoom, session?.user.id)

	// an open panel is what counts as seeing a chat mention, which clears every badge for this chat room at once
	useEffect(() => {
		markChatRoomOpened(topicId, teamId)
		sendChatMentionsViewed(topicId, teamId).catch(() => {})
		onOpenChatRoom?.()
	}, [topicId, teamId, onOpenChatRoom])

	// a user who does not have access to the chat room gets a call to action button instead
	if (chatRoom.isRejected && !joinButton) {
		return null
	}

	// "open" and "enlarged" render the same panel, sized by the flag
	const isPanelEnlarged = panelState === "enlarged"

	// the open chat room the switcher row names, taken from this chat room's own menu row
	const currentChatRoom = chatRoomMenu.chatRoomOptions?.find((chatRoomOption) => chatRoomOption.isActive)
	const currentRoom: ChatPanelCurrentRoom = {
		name: currentChatRoom?.name ?? contextName,
		team: currentChatRoom?.team,
	}

	// a chat room the user does not have access to gets a call to action button instead
	if (chatRoom.isRejected) {
		return (
			<ChatCallToActionPanel
				isEnlarged={isPanelEnlarged}
				onPanelState={onPanelState}
				currentChatRoom={currentRoom}
				chatRoomMenu={chatRoomMenu}
				actionLine="Join this team to start the conversation"
			>
				{joinButton}
			</ChatCallToActionPanel>
		)
	}

	// the clear chat option belongs to a team leader or an admin. an empty chat room has nothing to clear
	const isClearable = (isTeamLeader || isAdmin) && chatRoom.chatMessages.length > 0
	return renderOnTop(
		<ChatPanelWidget isEnlarged={isPanelEnlarged} onMinimizeChat={() => onPanelState("collapsed")}>
			<ChatPanelHeader
				isEnlarged={isPanelEnlarged}
				isRoom
				onToggleSize={() => onPanelState(isPanelEnlarged ? "open" : "enlarged")}
				onCollapse={() => onPanelState("collapsed")}
				currentChatRoom={currentRoom}
				chatRoomMenu={{
					...chatRoomMenu,
					onClear: isClearable ? () => setIsClearChatOpen(true) : undefined,
					clearLabel: `Clear ${contextName} chat`,
				}}
			/>
			{/* the chat panel stays on screen while another chat room loads */}
			{chatRoom.isLoaded ? (
				<Suspense fallback={<ChatMessagesLoading />}>
					<ChatRoomMessages
						isEnlarged={isPanelEnlarged}
						chatRoom={chatRoom}
						userId={session?.user.id ?? ""}
						isTeamLeader={isTeamLeader}
						isAdmin={isAdmin}
						chatName={contextName}
						topicId={topicId}
						teamId={teamId}
						onReplyChatMessage={reply.selectChatMessage}
					/>
				</Suspense>
			) : (
				<ChatMessagesLoading />
			)}

			{/* a budget rejection is private to the poster, shown here instead of posted to the chat room */}
			{chatRoom.rejectionReason && (
				<div className="text-muted-foreground flex shrink-0 items-start justify-between gap-2 border-t px-3 py-2 text-xs">
					<ChatBudgetNotice />
					<button
						type="button"
						aria-label="Dismiss"
						onClick={chatRoom.clearRejectionReason}
						className="hover:text-foreground shrink-0"
					>
						<X className="size-3.5" />
					</button>
				</div>
			)}
			{chatRoom.isLoaded ? (
				<ChatRoomComposer
					memberUsernames={memberUsernames}
					reply={reply}
					onPostChatMessage={async (content, replyToChatMessageId, attachments) => {
						// the reply target clears only with the draft, so a failed post keeps both
						const isPosted = await chatRoom.postChatMessage(content, replyToChatMessageId, attachments)
						if (isPosted) {
							reply.clear()
						}
						return isPosted
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
							await chatRoom.reloadChatMessages()
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
