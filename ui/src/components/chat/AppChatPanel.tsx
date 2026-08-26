// the one shared chat panel that the app shell mounts
import type { ChatRoom } from "@shared/contracts"
import { Plus } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { authClient } from "@/clients/authClient"
import { fetchChatMentionCount, fetchChatRooms } from "@/clients/chatRoomClient"
import { ChatCallToActionPanel } from "@/components/chat/ChatCallToActionPanel"
import type { ChatRoomOption } from "@/components/chat/ChatOptionsMenu"
import { ChatLoadingPanel, ChatPill, renderOnTop } from "@/components/chat/ChatPanelWidget"
import { ChatRoomPanel } from "@/components/chat/ChatRoomPanel"
import { PrivateChatPanel } from "@/components/chat/PrivateChatPanel"
import { Button } from "@/components/primitives/button"
import { JoinTeamButton } from "@/components/team/JoinTeamButton"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { isWideScreen } from "@/lib/utils"
import {
	type ChatId,
	type ChatPageContext,
	type ChatPanelState,
	isPageChatRoom,
	isSameChat,
	setChatId,
	setChatPanelState,
	toDefaultChatId,
	useChatPanel,
} from "@/stores/chatPanelStore"
import { setChatRooms, useAllChatMentions, useChatRooms } from "@/stores/chatRoomStore"

// how often the chat mention badge count is polled for, kept under a minute
const CHAT_MENTION_POLL_MS = 45_000

/**
 * The chat menu's dropdown options. One for each room the user can open, and one for the call to action to join a team,
 * A topic included by multiple teams gets a row for each and is told apart by the team's avatar with a team icon on the right.
 * Private chat and Clear chat are also options if available.
 */
function toChatRoomOptions(
	chatRoomOptions: ChatRoom[],
	chatId: ChatId | null,
	pageContext: ChatPageContext | null,
): ChatRoomOption[] {
	const chatRoomChoices: ChatRoomOption[] = chatRoomOptions.map((chatRoomOption) => ({
		key: `${chatRoomOption.topicId ?? "team"}:${chatRoomOption.teamId}`,
		name: chatRoomOption.name,
		team: { teamId: chatRoomOption.teamId, name: chatRoomOption.teamName, hasAvatar: chatRoomOption.teamHasAvatar },
		isHighlighted: isPageChatRoom(chatRoomOption, pageContext),
		isTeamRoom: chatRoomOption.topicId === null,
		isActive: isSameChat(chatId, { kind: "room", teamId: chatRoomOption.teamId, topicId: chatRoomOption.topicId }),
		chatMentions: chatRoomOption.mentions,
		onSelect: () => setChatId({ kind: "room", teamId: chatRoomOption.teamId, topicId: chatRoomOption.topicId }),
	}))

	// the join team option, whose row opens up the join panel instead of the chat messages
	const joinTeam = pageContext?.joinTeam
	if (!joinTeam || chatRoomOptions.some((room) => room.teamId === joinTeam.teamId)) {
		return toMenuOrder(chatRoomChoices)
	}
	const joinChatId: ChatId = {
		kind: "room",
		teamId: joinTeam.teamId,
		topicId: pageContext?.topicId ?? null,
	}
	chatRoomChoices.push({
		key: `join:${joinTeam.teamId}`,
		name: joinTeam.name,
		team: { teamId: joinTeam.teamId, name: joinTeam.name, hasAvatar: joinTeam.hasAvatar },
		isActive: isSameChat(chatId, joinChatId),
		onSelect: () => setChatId(joinChatId),
	})
	return toMenuOrder(chatRoomChoices)
}

// alphabetical so a topic owned by multiple teams can be told apart. the private chat and clear chat are not sorted.
function toMenuOrder(choices: ChatRoomOption[]): ChatRoomOption[] {
	return [...choices].sort((first, second) => first.name.localeCompare(second.name))
}

/**
 * The single global chat panel in the app shell layout
 */
export function AppChatPanel() {
	const { data: session } = authClient.useSession()
	const { panelState, chatId, pageContext } = useChatPanel()
	// the chat rooms have an array of mentions for showing the badge count and tooltip
	const chatRooms = useChatRooms()
	const [searchParams] = useSearchParams()
	// whether the room list has answered yet
	const [hasLoadedChatRooms, setHasLoadedChatRooms] = useState(false)

	// the chat rooms for the dropdown menu, re-read whenever the badge count says something changed
	const userId = session?.user.id
	const updateChatRooms = useCallback((): void => {
		if (!userId) {
			setChatRooms([])
			setHasLoadedChatRooms(true)
			return
		}
		fetchChatRooms()
			.then(setChatRooms)
			.catch(() => setChatRooms([]))
			.finally(() => setHasLoadedChatRooms(true))
	}, [userId])
	useEffect(() => {
		// the list belongs to one user
		setHasLoadedChatRooms(false)
		updateChatRooms()
	}, [updateChatRooms])

	// the chat mentions badge poll reloads the chat rooms whenever it says something changed
	useEffect(() => {
		if (!userId) {
			return
		}
		let previousChatMentionCount = -1
		const readCount = (): void => {
			fetchChatMentionCount()
				.then((chatMentionCount) => {
					if (chatMentionCount !== previousChatMentionCount) {
						previousChatMentionCount = chatMentionCount
						updateChatRooms()
					}
				})
				.catch(() => {})
		}
		readCount()
		const chatMentionTimeout = setInterval(readCount, CHAT_MENTION_POLL_MS)
		return () => clearInterval(chatMentionTimeout)
	}, [userId, updateChatRooms])

	// a chat mention badge links to its team or topic page
	const linkedTeamId = searchParams.get("chat")
	const linkedTopicId = pageContext?.topicId ?? null
	useEffect(() => {
		if (linkedTeamId) {
			setChatId({ kind: "room", teamId: linkedTeamId, topicId: linkedTopicId })
		}
	}, [linkedTeamId, linkedTopicId])

	// nothing selected yet is what chooses a default chat id. a visitor selects nothing unless the page
	// offers a team to join
	const pickDefaultChat = useCallback((): void => {
		if (chatId || !(session || pageContext?.joinTeam)) {
			return
		}
		const defaultChatId = toDefaultChatId(pageContext, chatRooms)
		if (defaultChatId) {
			setChatId(defaultChatId)
		}
	}, [chatId, session, pageContext, chatRooms])

	const openPanel = (): void => {
		if (hasLoadedChatRooms) {
			pickDefaultChat()
		}
		// a phone has no room for a docked panel beside the page, so it opens over it
		setChatPanelState(isWideScreen() ? "open" : "enlarged")
	}

	// opening before the rooms answered leaves nothing selected, so the choice is made again once they land
	useEffect(() => {
		if (panelState !== "collapsed" && hasLoadedChatRooms) {
			pickDefaultChat()
		}
	}, [panelState, hasLoadedChatRooms, pickDefaultChat])

	// every mention for a chat that the user hasn't opened
	const chatMentions = useAllChatMentions()

	if (panelState === "collapsed") {
		return renderOnTop(<ChatPill onOpenChat={openPanel} chatMentions={chatMentions} />)
	}

	const chatRoomChoices = toChatRoomOptions(chatRooms, chatId, pageContext)

	// the private chat belongs to a topic, so it is only offered from a topic page
	const openPrivateChat = pageContext?.topicId
		? () => setChatId({ kind: "private", topicId: pageContext.topicId ?? "" })
		: undefined
	if (chatId?.kind === "private") {
		return (
			<PrivateChatPanel
				key={`private:${chatId.topicId}`}
				topicId={chatId.topicId}
				topicName={pageContext?.name ?? "this topic"}
				panelState={panelState}
				onPanelState={setChatPanelState}
				chatRoomOptions={chatRoomChoices}
				onOpenMenu={updateChatRooms}
			/>
		)
	}
	if (chatId?.kind === "room") {
		const openChatRoom = chatRooms.find(
			(chatRoom) => chatRoom.teamId === chatId.teamId && chatRoom.topicId === chatId.topicId,
		)
		return (
			<ChatRoomPanel
				key={`${chatId.topicId ?? "team"}:${chatId.teamId}`}
				topicId={chatId.topicId}
				contextName={openChatRoom?.name ?? pageContext?.name ?? "this team"}
				teamId={chatId.teamId}
				chatRoomOptions={chatRoomChoices}
				panelState={panelState}
				onPanelState={setChatPanelState}
				onPrivateChat={openPrivateChat}
				onOpenMenu={updateChatRooms}
				onOpenChatRoom={updateChatRooms}
				joinButton={
					openChatRoom || !pageContext?.joinTeam ? undefined : (
						<JoinTeamButton
							teamId={pageContext.joinTeam.teamId}
							teamName={pageContext.joinTeam.name}
							hasJoinRequest={pageContext.joinTeam.hasRequestedToJoin}
							isSignedIn={Boolean(session)}
							onChangeRequest={updateChatRooms}
						/>
					)
				}
			/>
		)
	}

	// nothing is selected because the chat rooms have not answered yet, so the frame opens and pours until they land
	if (session && !hasLoadedChatRooms) {
		return <ChatLoadingPanel isEnlarged={panelState === "enlarged"} onPanelStateChange={setChatPanelState} />
	}

	// nothing to open, so the panel asks for the first topic or for an account
	return <NoConversationPanel isSignedIn={Boolean(session)} panelState={panelState} />
}

// the panel where the user has no conversation to open
function NoConversationPanel({ isSignedIn, panelState }: { isSignedIn: boolean; panelState: ChatPanelState }) {
	const [isNewTopicOpen, setIsNewTopicOpen] = useState(false)
	const navigate = useNavigate()
	return (
		<>
			{/* saving a new topic navigates to that topic */}
			{isNewTopicOpen && (
				<EditTopicModal
					onClose={() => setIsNewTopicOpen(false)}
					onTopicSaved={async (topicId) => {
						setIsNewTopicOpen(false)
						navigate(`/topics/${topicId}`)
					}}
				/>
			)}
			<ChatCallToActionPanel
				isEnlarged={panelState === "enlarged"}
				onPanelState={setChatPanelState}
				actionLine={isSignedIn ? "Start a topic to begin the conversation" : "Sign up to begin the conversation"}
				placeholder="Carl is waiting for your topic…"
			>
				{isSignedIn ? (
					<Button className="shrink-0" onClick={() => setIsNewTopicOpen(true)}>
						<Plus className="size-4" />
						New Topic
					</Button>
				) : (
					<Button className="shrink-0" onClick={() => navigate("/signup?cta=chat")}>
						Sign up
					</Button>
				)}
			</ChatCallToActionPanel>
		</>
	)
}
