import { SITE_TITLE, toPageTitle } from "@shared/seo"
import { useEffect } from "react"
import { useAllChatMentions } from "@/stores/chatRoomStore"
import { useAllNoteCount } from "@/stores/noteBadgeStore"
import { useTopicInviteBadges } from "@/stores/topicInviteStore"

/**
 * Names the browser tab after the page on screen, with the unread badge count in it.
 * A null title keeps the last title while the page name loads.
 */
export function usePageTitle(title: string | null): void {
	// everything waiting for the user, chats, notes, and topic invitations summed
	const unreadBadgeCount = useAllChatMentions().length + useAllNoteCount() + useTopicInviteBadges().length
	useEffect(() => {
		// keep the last title while the page name loads
		if (title === null) {
			return
		}
		// name the tab for this page, and put the site's title back if it leaves
		document.title = toTabTitle(title, unreadBadgeCount)
		return () => {
			document.title = SITE_TITLE
		}
	}, [title, unreadBadgeCount])
}

// the tab title, the page's title with the unread badge count in it if the count is above zero
function toTabTitle(pageName: string, unreadBadgeCount: number): string {
	const pageTitle = toPageTitle(pageName)
	return unreadBadgeCount > 0 ? `(${unreadBadgeCount}) ${pageTitle}` : pageTitle
}
