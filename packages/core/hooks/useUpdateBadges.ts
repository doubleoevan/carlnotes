import { fetchTopicInviteBadges } from "@carlnotes/client/activityClient"
import { fetchChatMentionCount, fetchChatRooms } from "@carlnotes/client/chatRoomClient"
import { useEffect } from "react"
import { isFocusedAndOnline, subscribeToFocusAndOnline } from "../lib/focusAndOnline"
import { startUpdateBadgePoll } from "../lib/updateBadgePoll"
import { toCurrentChatAccountGuard } from "../stores/chatConversationStore"
import { setChatRooms } from "../stores/chatRoomStore"
import { setTopicInviteBadges } from "../stores/topicInviteStore"

/**
 * Polls the chat mention count and the waiting topic invitations for the signed-in account, using Query's browser or
 * native foreground and connectivity adapters, and reloads the chat rooms when the mention count changes.
 */
export function useUpdateBadges(userId: string | null | undefined, reloadChatRooms: () => void): void {
	useEffect(() => {
		// clear the previous account's invite badges
		setTopicInviteBadges([])
		if (!userId) {
			return
		}
		return startUpdateBadgePoll({
			isActive: isFocusedAndOnline,
			subscribe: subscribeToFocusAndOnline,
			isCurrentAccount: toCurrentChatAccountGuard(),
			fetchChatMentionCount,
			fetchTopicInviteBadges,
			onChatMentionCountChange: reloadChatRooms,
			onTopicInviteBadges: setTopicInviteBadges,
		})
	}, [userId, reloadChatRooms])
}

/**
 * Reloads the chat rooms into the shared store for the current account, and leaves the store alone for a replaced one.
 */
export async function reloadChatRooms(): Promise<void> {
	const isCurrentAccount = toCurrentChatAccountGuard()
	try {
		const chatRooms = await fetchChatRooms()
		if (isCurrentAccount()) {
			setChatRooms(chatRooms)
		}
	} catch {
		// the next poll or open retries without clearing the rooms shown
	}
}
