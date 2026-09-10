import type { ChatRoom } from "@shared/contracts"
import { useEffect, useSyncExternalStore } from "react"
import { toStoreListeners } from "@/stores/storeListeners"

/**
 * Which chat room the panel is showing, or the private chat about one topic. It holds the addressing keys
 * alone, never a chat room's name or counts, so the panel reads those live from the badge store instead
 * of from a copy that could go stale.
 */
export type ChatId =
	// a shared chat room, keyed by the same pair the chat room list and the stream are keyed by
	| ({ kind: "room" } & Pick<ChatRoom, "teamId" | "topicId">)
	// one user's private conversation with Carl about a topic or a team, which is no chat room at all
	| { kind: "private"; topicId: string; teamId?: undefined; newTopic?: undefined }
	| { kind: "private"; topicId?: undefined; teamId: string; newTopic?: undefined }
	// the new-topic chat, where Carl makes a topic, bound to neither
	| { kind: "private"; newTopic: true; topicId?: undefined; teamId?: undefined }

/** How much of the screen the panel takes. */
export type ChatPanelState = "collapsed" | "open" | "enlarged"

/**
 * What the page on screen is about, which the panel opens on before falling back to the latest chat room.
 * A page names its team so the panel can offer the way in where the user is on none of them.
 */
export type ChatPageContext = {
	// the topic this page is about, which is also whose private chat the menu offers
	topicId: string | null
	// the team whose chat room this page would open, and what to call it in the join call to action
	teamId: string | null
	name: string
	// set where the user is not on the team, so the panel offers joining instead of the chat messages
	joinTeam: { teamId: string; name: string; hasAvatar: boolean; hasRequestedToJoin: boolean } | null
	// what this page is about: its teams, its topics, or both
	pageTeamIds?: string[]
	pageTopicIds?: string[]
	// which kind of chat room this page opens first
	preferredChatRoomKind?: "team" | "topic"
	// whether a signed-in user's feed is still empty, no topic of their own and none subscribed to
	isUserTopicFeedEmpty?: boolean
}

// the panel lives in the app shell and outlives every route, so its state lives beside it instead of in a page
let panelState: ChatPanelState = "collapsed"
let chatId: ChatId | null = null
let pageContext: ChatPageContext | null = null
// the chat message an open should load, set when a mention badge opens its chat room. it belongs to
// one open instead of to the chat itself, so the chat room clears it once it has acted
let chatMessageId: number | null = null
const { subscribe, publish, getVersion } = toStoreListeners()

/** Open, enlarge, or close the panel, which every page shares. */
export function setChatPanelState(next: ChatPanelState): void {
	panelState = next
	// minimizing is closing: the chat room is forgotten, so opening somewhere new selects for that page
	if (next === "collapsed") {
		chatId = null
	}
	publish()
}

/**
 * Switches the chat panel to a chat room or a private chat.
 */
export function setChatId(nextChatId: ChatId): void {
	chatId = nextChatId
	chatMessageId = null
	publish()
}

/**
 * Switches the chat panel to a chat and scrolls to a chat message.
 */
export function setChatIdAtChatMessage(nextChatId: ChatId, nextChatMessageId: number): void {
	chatId = nextChatId
	chatMessageId = nextChatMessageId
	publish()
}

/**
 * The chat message the panel should scroll to, or null. Stays set until the room clears it.
 */
export function useChatMessageMentioned(): number | null {
	// the version is the snapshot, the same way the panel's own state is read
	useSyncExternalStore(subscribe, getVersion, getVersion)
	return chatMessageId
}

/**
 * Clear the mentioned chat message once the room has scrolled to it.
 */
export function clearMentionedChatMessage(): void {
	if (chatMessageId === null) {
		return
	}
	chatMessageId = null
	publish()
}

/**
 * Tell the panel what the page on screen is about, for as long as that page is mounted. A page that
 * is about nothing in particular registers null and leaves the panel wherever the user left it.
 */
export function useRegisterChatContext(nextPageContext: ChatPageContext | null): void {
	// the identity of the value is what changes, so the effect keys on its contents instead
	const pageContextKey = JSON.stringify(nextPageContext)
	useEffect(() => {
		// the key is parsed back, so the stored value never closes over a stale render's literal
		pageContext = pageContextKey === "null" ? null : (JSON.parse(pageContextKey) as ChatPageContext)
		publish()
		// leaving the page clears it, so the panel stops offering a chat room that page was about
		return () => {
			pageContext = null
			publish()
		}
	}, [pageContextKey])
}

/**
 * The panel's live state and which chat it holds. The chat id is null until an open selects one and
 * null again once the panel is minimized, so opening it somewhere new chooses for that page while a
 * chat room the user switched to survives navigation.
 */
export function useChatPanel(): {
	panelState: ChatPanelState
	chatId: ChatId | null
	// what the page on screen is about, which the panel reads when it selects its default
	pageContext: ChatPageContext | null
} {
	// the version is the snapshot. the values it stands for are module state
	useSyncExternalStore(subscribe, getVersion, getVersion)
	return { panelState, chatId, pageContext }
}

/** What the panel is pointed at, without the subscription, so it can be read outside a component. */
export function toChatId(): ChatId | null {
	return chatId
}

/**
 * Whether a chat room is one the page is about, by its team or by its topic.
 * The menu highlights these and the default chat chooses them.
 */
export function isPageChatRoom(
	chatRoom: Pick<ChatRoom, "teamId" | "topicId">,
	pageContext: ChatPageContext | null,
): boolean {
	const isPageTeam = pageContext?.pageTeamIds?.includes(chatRoom.teamId) ?? false
	const isPageTopic = chatRoom.topicId !== null && (pageContext?.pageTopicIds?.includes(chatRoom.topicId) ?? false)
	return isPageTeam || isPageTopic
}

/** Whether two chat ids name the same conversation, which the menu's check reads. */
export function isSameChat(firstChatId: ChatId | null, secondChatId: ChatId): boolean {
	// nothing selected yet, or two different kinds, is never the same conversation
	if (!firstChatId || firstChatId.kind !== secondChatId.kind) {
		return false
	}
	// a private chat is named by its topic or its team, and a chat room by the pair the routes address it with
	if (firstChatId.kind === "private" && secondChatId.kind === "private") {
		return (
			firstChatId.topicId === secondChatId.topicId &&
			firstChatId.teamId === secondChatId.teamId &&
			firstChatId.newTopic === secondChatId.newTopic
		)
	}
	// the room arms are re-checked so the narrowing holds
	return (
		firstChatId.kind === "room" &&
		secondChatId.kind === "room" &&
		firstChatId.teamId === secondChatId.teamId &&
		firstChatId.topicId === secondChatId.topicId
	)
}

/**
 * Picks the chat this page opens on: the page's own, else the busiest chat room, else the new-topic chat,
 * which an empty feed opens on its own.
 */
export function toDefaultChatId(pageContext: ChatPageContext | null, chatRooms: ChatRoom[]): ChatId | null {
	// open the new-topic chat for a user with nothing in their feed
	if (pageContext?.isUserTopicFeedEmpty) {
		return { kind: "private", newTopic: true }
	}
	// a team page opens that team's own chat room, or offers the way in where the user is on none
	if (pageContext?.teamId) {
		const teamChatRoom = chatRooms.find(
			(chatRoom) => chatRoom.teamId === pageContext.teamId && chatRoom.topicId === null,
		)
		if (teamChatRoom) {
			return { kind: "room", teamId: teamChatRoom.teamId, topicId: null }
		}
		// on neither the team nor its invite, so the topic rules below decide instead
		if (pageContext.joinTeam) {
			return { kind: "room", teamId: pageContext.joinTeam.teamId, topicId: null }
		}
	}
	// a topic page opens that topic's conversation, closest first
	if (pageContext?.topicId) {
		const topicChatRoom = chatRooms.find((chatRoom) => chatRoom.topicId === pageContext.topicId)
		if (topicChatRoom) {
			return { kind: "room", teamId: topicChatRoom.teamId, topicId: topicChatRoom.topicId }
		}
		if (pageContext.joinTeam) {
			return { kind: "room", teamId: pageContext.joinTeam.teamId, topicId: pageContext.topicId }
		}
		// no chat room and no way into one, so the topic falls back to carl
		return { kind: "private", topicId: pageContext.topicId }
	}

	// the highlighted chat rooms that reference a page
	const pageChatRooms = chatRooms.filter((chatRoom) => isPageChatRoom(chatRoom, pageContext))
	// a chat room that references the page wins, then any chat room with mentions waiting, then simply the first available
	const selectedChatRoom =
		toBusiestChatRoom(pageChatRooms, pageContext) ?? toBusiestChatRoom(chatRooms, pageContext) ?? chatRooms[0]
	if (selectedChatRoom) {
		return { kind: "room", teamId: selectedChatRoom.teamId, topicId: selectedChatRoom.topicId }
	}
	// fall back to the new-topic chat
	return { kind: "private", newTopic: true }
}

// the chat room holding the most mentions, with the kind the page leads on winning before any other.
// none where every chat room is quiet, which is what sends the caller to its next choice
function toBusiestChatRoom(chatRooms: ChatRoom[], pageContext: ChatPageContext | null): ChatRoom | undefined {
	// a page asking for neither kind reads as a team page, since a team's chat room is the broader one
	const preferredChatRoomKind = pageContext?.preferredChatRoomKind ?? "team"
	const isPreferredChatRoomKind = (chatRoom: ChatRoom): boolean =>
		preferredChatRoomKind === "team" ? chatRoom.topicId === null : chatRoom.topicId !== null

	// a quiet chat room never wins, so the preference only ever picks between chat rooms that have mentions
	const chatRoomsWithMentions = chatRooms.filter((chatRoom) => chatRoom.chatMentions.length > 0)
	const chatRoomsToChooseFrom = chatRoomsWithMentions.some(isPreferredChatRoomKind)
		? chatRoomsWithMentions.filter(isPreferredChatRoomKind)
		: chatRoomsWithMentions
	return chatRoomsToChooseFrom.reduce<ChatRoom | undefined>(
		(busiestChatRoom, chatRoom) =>
			chatRoom.chatMentions.length > (busiestChatRoom?.chatMentions.length ?? 0) ? chatRoom : busiestChatRoom,
		undefined,
	)
}

// the last topic a topic tool changed, and how many topic changes so far
let changedTopicId: string | null = null
let topicChangeCount = 0

/**
 * Publishes that a topic tool changed a topic.
 */
export function publishTopicChanged(topicId: string): void {
	changedTopicId = topicId
	topicChangeCount += 1
	publish()
}

/**
 * Reads the topic change count when this topic was changed last, or 0 otherwise.
 */
export function useTopicChangeCount(topicId: string | null): number {
	useSyncExternalStore(subscribe, getVersion)
	return topicId !== null && changedTopicId === topicId ? topicChangeCount : 0
}
