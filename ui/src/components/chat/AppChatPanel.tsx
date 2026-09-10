// the one shared chat panel that the app shell mounts
import type { ChatRoom } from "@shared/contracts"
import { useCallback, useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { fetchTopicInviteBadges } from "@/clients/activityClient"
import { authClient } from "@/clients/authClient"
import type { ChatPage } from "@/clients/chatClient"
import { fetchChatMentionCount, fetchChatRooms } from "@/clients/chatRoomClient"
import { fetchNoteBadges } from "@/clients/noteClient"
import { ChatCallToActionPanel } from "@/components/chat/ChatCallToActionPanel"
import type { ChatRoomOption } from "@/components/chat/ChatOptionsMenu"
import { ChatLoadingPanel, ChatPill, renderOnTop } from "@/components/chat/ChatPanelWidget"
import { ChatRoomPanel } from "@/components/chat/ChatRoomPanel"
import { PrivateChatPanel } from "@/components/chat/PrivateChatPanel"
import { Button } from "@/components/primitives/button"
import { JoinTeamButton } from "@/components/team/JoinTeamButton"
import { isWideScreen } from "@/lib/utils"
import {
	type ChatId,
	type ChatPageContext,
	type ChatPanelState,
	isPageChatRoom,
	isSameChat,
	setChatId,
	setChatIdAtChatMessage,
	setChatPanelState,
	toDefaultChatId,
	useChatPanel,
} from "@/stores/chatPanelStore"
import { setChatRooms, toFirstChatMention, useAllChatMentions, useChatRooms } from "@/stores/chatRoomStore"
import { setNoteBadges } from "@/stores/noteBadgeStore"
import { setTopicInviteBadges } from "@/stores/topicInviteStore"

// how often the chat mention and note badges are polled, kept under a minute
const CHAT_MENTION_POLL_MS = 45_000
/**
 * The chat menu's dropdown options, one row for each chat room the user can open plus one to join the page's team.
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
		chatMentions: chatRoomOption.chatMentions,
		chatRoomMembers: chatRoomOption.chatRoomMembers,
		onSelect: () => {
			// a row with mentions loads the earliest one, so reading forward passes the rest in order
			const chatId: ChatId = { kind: "room", teamId: chatRoomOption.teamId, topicId: chatRoomOption.topicId }
			const firstChatMention = toFirstChatMention(chatRoomOption.chatMentions)
			if (firstChatMention) {
				setChatIdAtChatMessage(chatId, firstChatMention.chatMessageId)
				return
			}
			setChatId(chatId)
		},
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

// sort alphabetically so that topic options with the same name can be told apart by their team
function toMenuOrder(chatRoomOptions: ChatRoomOption[]): ChatRoomOption[] {
	return [...chatRoomOptions].sort((first, second) => first.name.localeCompare(second.name))
}

// return the topic or team id for the page to start a private chat with
function toPrivateChatId(pageContext: ChatPageContext | null, chatId: ChatId | null): ChatId | null {
	if (pageContext?.topicId) {
		return { kind: "private", topicId: pageContext.topicId }
	}
	const teamId = pageContext?.teamId ?? (chatId?.kind !== "private" ? (chatId?.teamId ?? null) : null)
	return teamId ? { kind: "private", teamId } : null
}

// the conversation page a private chat id addresses: the new-topic chat, a topic, or a team
function toPrivateChatPage(chatId: ChatId & { kind: "private" }): ChatPage {
	if (chatId.newTopic) {
		return { newTopic: true }
	}
	return chatId.topicId !== undefined ? { topicId: chatId.topicId } : { teamId: chatId.teamId }
}

// return the placeholder text for a private chat
function toPrivateChatName(
	chatId: ChatId & { kind: "private" },
	chatRooms: ChatRoom[],
	pageContext: ChatPageContext | null,
): string {
	if (chatId.newTopic) {
		return "a new topic"
	}
	if (chatId.teamId !== undefined) {
		return chatRooms.find((chatRoom) => chatRoom.teamId === chatId.teamId)?.teamName ?? pageContext?.name ?? "this team"
	}
	return pageContext?.name ?? "this topic"
}

// the menu handler that opens the new-topic chat: for a signed-in user, and left out of that chat's own menu
function toOpenNewTopicChat(isSignedIn: boolean, chatId: ChatId | null): (() => void) | undefined {
	if (!isSignedIn || (chatId?.kind === "private" && chatId.newTopic)) {
		return undefined
	}
	return () => setChatId({ kind: "private", newTopic: true })
}

// whether the panel already opened for an empty feed this page load. a user who closes it is left alone
let hasOpenedOnEmptyUserTopicFeed = false

// an empty feed opens the panel on the new-topic chat by itself, once per page load
function useOpenNewTopicChatOnEmptyFeed(pageContext: ChatPageContext | null, panelState: ChatPanelState): void {
	const isUserTopicFeedEmpty = Boolean(pageContext?.isUserTopicFeedEmpty)
	// biome-ignore lint/correctness/useExhaustiveDependencies: the panel state is read once on arrival, so a close stays closed
	useEffect(() => {
		if (isUserTopicFeedEmpty && panelState === "collapsed" && !hasOpenedOnEmptyUserTopicFeed) {
			hasOpenedOnEmptyUserTopicFeed = true
			setChatId({ kind: "private", newTopic: true })
			setChatPanelState(isWideScreen() ? "open" : "enlarged")
		}
	}, [isUserTopicFeedEmpty])
}

/**
 * The single global chat panel in the app shell layout
 */
export function AppChatPanel() {
	const { data: session } = authClient.useSession()
	const { panelState, chatId, pageContext } = useChatPanel()
	// the chat rooms, each with the user's unread chat mentions in it
	const chatRooms = useChatRooms()
	const [searchParams] = useSearchParams()
	// whether the chat room list has answered yet
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
		// a user change reloads the list from scratch
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

		// the note badges are a short list of only what is waiting, read outright on every poll
		const readNoteBadges = (): void => {
			fetchNoteBadges()
				.then(setNoteBadges)
				.catch(() => {})
		}
		// read the topic invitations waiting for an answer
		const readTopicInvites = (): void => {
			fetchTopicInviteBadges()
				.then(setTopicInviteBadges)
				.catch(() => {})
		}
		const readBadges = (): void => {
			readCount()
			readNoteBadges()
			readTopicInvites()
		}
		readBadges()
		const badgePollInterval = setInterval(readBadges, CHAT_MENTION_POLL_MS)
		return () => clearInterval(badgePollInterval)
	}, [userId, updateChatRooms])

	// a chat mention badge links to its team or topic page
	const linkedTeamId = searchParams.get("chat")
	const linkedTopicId = pageContext?.topicId ?? null
	useEffect(() => {
		if (linkedTeamId) {
			setChatId({ kind: "room", teamId: linkedTeamId, topicId: linkedTopicId })
		}
	}, [linkedTeamId, linkedTopicId])

	// a default chat id is picked only when nothing is selected yet. a visitor picks nothing unless the page
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

	// opening before the chat rooms answered leaves nothing selected, so the choice is made again once they load
	useEffect(() => {
		if (panelState !== "collapsed" && hasLoadedChatRooms) {
			pickDefaultChat()
		}
	}, [panelState, hasLoadedChatRooms, pickDefaultChat])

	// open the panel on the new-topic chat for an empty feed
	useOpenNewTopicChatOnEmptyFeed(session ? pageContext : null, panelState)

	// every chat mention for a chat that the user hasn't opened
	const chatMentions = useAllChatMentions()

	if (panelState === "collapsed") {
		return renderOnTop(<ChatPill onOpenChat={openPanel} chatMentions={chatMentions} />)
	}

	const chatRoomChoices = toChatRoomOptions(chatRooms, chatId, pageContext)

	// the private chat opens on the topic this page shows, or on a team when this page or the open chat room names one
	const privateChatId = toPrivateChatId(pageContext, chatId)
	const openPrivateChat = privateChatId ? () => setChatId(privateChatId) : undefined
	// offer the new-topic chat in the menu to any signed-in user
	const openNewTopicChat = toOpenNewTopicChat(Boolean(session), chatId)
	if (chatId?.kind === "private") {
		return (
			<PrivateChatPanel
				key={`private:${chatId.topicId ?? chatId.teamId ?? "new-topic"}`}
				page={toPrivateChatPage(chatId)}
				chatName={toPrivateChatName(chatId, chatRooms, pageContext)}
				panelState={panelState}
				onPanelState={setChatPanelState}
				chatRoomOptions={chatRoomChoices}
				onOpenMenu={updateChatRooms}
				onNewTopicChat={openNewTopicChat}
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
				chatRoomMenu={{
					chatRoomOptions: chatRoomChoices,
					onPrivateChat: openPrivateChat,
					onNewTopicChat: openNewTopicChat,
					onOpenChatRoomMenu: updateChatRooms,
				}}
				panelState={panelState}
				onPanelState={setChatPanelState}
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

	// nothing is selected while the chat rooms have not answered yet
	if (session && !hasLoadedChatRooms) {
		return <ChatLoadingPanel isEnlarged={panelState === "enlarged"} onPanelStateChange={setChatPanelState} />
	}

	// show a visitor the panel that asks for an account
	return <NoConversationPanel panelState={panelState} />
}

// the panel where a visitor has no conversation to open, which asks for an account
function NoConversationPanel({ panelState }: { panelState: ChatPanelState }) {
	const navigate = useNavigate()
	return (
		<ChatCallToActionPanel
			isEnlarged={panelState === "enlarged"}
			onPanelState={setChatPanelState}
			actionLine="Sign up to begin the conversation"
			placeholder="Carl is waiting for your topic…"
		>
			<Button className="shrink-0" onClick={() => navigate("/signup?cta=chat")}>
				Sign up
			</Button>
		</ChatCallToActionPanel>
	)
}
