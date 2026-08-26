import type { ChatRoom } from "@shared/contracts"
import { useEffect, useSyncExternalStore } from "react"

/**
 * Which room the panel is showing, or the private chat about one topic. It holds the addressing keys
 * alone, never a room's name or counts, so the panel reads those live from the badge store instead
 * of from a copy that could go stale.
 */
export type ChatId =
	// a shared chat room, keyed by the same pair the room list and the stream are keyed by
	| ({ kind: "room" } & Pick<ChatRoom, "teamId" | "topicId">)
	// one user's private conversation with Carl about a topic, which is no room at all
	| { kind: "private"; topicId: string }

/** How much of the screen the panel takes. */
export type ChatPanelState = "collapsed" | "open" | "enlarged"

/**
 * What the page on screen is about, which the panel opens on before falling back to the newest room.
 * A page names its team so the panel can offer the way in where the user is on none of them.
 */
export type ChatPageContext = {
	// the topic this page is about, which is also whose private chat the menu offers
	topicId: string | null
	// the team whose room this page would open, and what to call it in the join call to action
	teamId: string | null
	name: string
	// set where the user is not on the team, so the panel offers joining instead of the chat messages
	joinTeam: { teamId: string; name: string; hasAvatar: boolean; hasRequestedToJoin: boolean } | null
	// what this page is about: its teams, its topics, or both
	pageTeamIds?: string[]
	pageTopicIds?: string[]
	// which kind of room this page opens first
	preferredRoomKind?: "team" | "topic"
}

// the panel lives in the app shell and outlives every route, so its state lives beside it instead of in a page
let panelState: ChatPanelState = "collapsed"
let chatId: ChatId | null = null
let pageContext: ChatPageContext | null = null
const listeners = new Set<() => void>()
let version = 0

// tell every subscriber the panel moved
function publish(): void {
	version += 1
	for (const listener of listeners) {
		listener()
	}
}

// the store half useSyncExternalStore needs
function subscribe(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

/** Open, enlarge, or close the panel, which every page shares. */
export function setChatPanelState(next: ChatPanelState): void {
	panelState = next
	// minimizing is closing: the room is forgotten, so opening somewhere new selects for that page
	if (next === "collapsed") {
		chatId = null
	}
	publish()
}

/** Point the panel at a room or a private chat, which opening one from a page does. */
export function setChatId(next: ChatId): void {
	chatId = next
	publish()
}

/**
 * Tell the panel what the page on screen is about, for as long as that page is mounted. A page that
 * is about nothing in particular registers null and leaves the panel wherever the user left it.
 */
export function useRegisterChatContext(context: ChatPageContext | null): void {
	// the identity of the value is what changes, so the effect keys on its contents instead
	const contextKey = JSON.stringify(context)
	useEffect(() => {
		// the key is parsed back, so the stored value never closes over a stale render's literal
		pageContext = contextKey === "null" ? null : (JSON.parse(contextKey) as ChatPageContext)
		publish()
		// leaving the page clears it, so the panel stops offering a room that page was about
		return () => {
			pageContext = null
			publish()
		}
	}, [contextKey])
}

/**
 * The panel's live state and which chat it holds. The chat id is null until an open selects one and
 * null again once the panel is minimized, so opening it somewhere new chooses for that page while a
 * room the user switched to survives navigation.
 */
export function useChatPanel(): {
	panelState: ChatPanelState
	chatId: ChatId | null
	// what the page on screen is about, which the panel reads when it selects its default
	pageContext: ChatPageContext | null
} {
	// the version is the snapshot. the values it stands for are module state
	useSyncExternalStore(
		subscribe,
		() => version,
		() => version,
	)
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
export function isSameChat(first: ChatId | null, second: ChatId): boolean {
	// nothing selected yet, or two different kinds, is never the same conversation
	if (!first || first.kind !== second.kind) {
		return false
	}
	// a private chat is named by its topic alone, and a room by the pair the routes address it with
	if (first.kind === "private" && second.kind === "private") {
		return first.topicId === second.topicId
	}
	// the room arms are re-checked so the narrowing holds
	return (
		first.kind === "room" &&
		second.kind === "room" &&
		first.teamId === second.teamId &&
		first.topicId === second.topicId
	)
}

/**
 * Which conversation the panel opens on, decided once per open instead of on every navigation.
 * The rule is the closest match to the page. A team's page opens that team's room, and a topic's
 * page opens that topic's room, the way into the team that has it, or the user's private chat about
 * it, whichever of those three is closest to hand. A page that names teams without being one, which a profile does, opens the busiest of
 * those. Only a page about no conversation at all falls through to the busiest room anywhere, where
 * a team's leads a topic's unless the page asked otherwise, and a private chat is never reached.
 */
export function toDefaultChatId(pageContext: ChatPageContext | null, rooms: ChatRoom[]): ChatId | null {
	// a team page opens that team's own room, or offers the way in where the user is on none
	if (pageContext?.teamId) {
		const teamRoom = rooms.find((room) => room.teamId === pageContext.teamId && room.topicId === null)
		if (teamRoom) {
			return { kind: "room", teamId: teamRoom.teamId, topicId: null }
		}
		// on neither the team nor its invite, so the topic rules below decide instead
		if (pageContext.joinTeam) {
			return { kind: "room", teamId: pageContext.joinTeam.teamId, topicId: null }
		}
	}
	// a topic page opens that topic's conversation, closest first
	if (pageContext?.topicId) {
		const topicRoom = rooms.find((room) => room.topicId === pageContext.topicId)
		if (topicRoom) {
			return { kind: "room", teamId: topicRoom.teamId, topicId: topicRoom.topicId }
		}
		if (pageContext.joinTeam) {
			return { kind: "room", teamId: pageContext.joinTeam.teamId, topicId: pageContext.topicId }
		}
		// no room and no way into one, so the topic falls back to carl
		return { kind: "private", topicId: pageContext.topicId }
	}
	// the rooms a page names, which a profile does, are tried before the rest
	const named = rooms.filter((room) => isPageChatRoom(room, pageContext))
	const preferred = pageContext?.preferredRoomKind ?? "team"
	const selected = toBusiestPreferring(named, preferred) ?? toBusiestPreferring(rooms, preferred) ?? rooms[0]
	if (selected) {
		return { kind: "room", teamId: selected.teamId, topicId: selected.topicId }
	}
	return null
}

// the busiest room of the kind that leads, and the busiest of the other kind where that one holds nothing
function toBusiestPreferring(rooms: ChatRoom[], kind: "team" | "topic"): ChatRoom | undefined {
	const isPreferred = (room: ChatRoom): boolean => (kind === "team" ? room.topicId === null : room.topicId !== null)
	return toBusiest(rooms.filter(isPreferred)) ?? toBusiest(rooms.filter((room) => !isPreferred(room)))
}

// the room with the most unseen mentions, or none where nothing is waiting
function toBusiest(rooms: ChatRoom[]): ChatRoom | undefined {
	return rooms.reduce<ChatRoom | undefined>(
		(best, room) => (room.mentions.length > (best?.mentions.length ?? 0) ? room : best),
		undefined,
	)
}
