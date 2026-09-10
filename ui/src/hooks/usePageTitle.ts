import { useEffect } from "react"
import { useAllChatMentions } from "@/stores/chatRoomStore"
import { useAllNoteCount } from "@/stores/noteBadgeStore"
import { useTopicInviteBadges } from "@/stores/topicInviteStore"

// the shell's own title, put back when a page leaves
const DEFAULT_TITLE = "CarlNotes — He already read it. All of it."

// the tab title, with the unread count leading it while anything waits
function toPageTitle(name: string, unreadBadgeCount: number): string {
	const pageTitle = `${name} — CarlNotes`
	return unreadBadgeCount > 0 ? `(${unreadBadgeCount}) ${pageTitle}` : pageTitle
}

/**
 * Name the browser tab title after the page on screen prefixed by the unread badge count
 * Pass null while the name is loading to keep the last title.
 */
export function usePageTitle(title: string | null): void {
	// everything waiting for the user, chats, notes, and topic invitations summed
	const unreadBadgeCount = useAllChatMentions().length + useAllNoteCount() + useTopicInviteBadges().length
	useEffect(() => {
		// keep the last title while the page name loads
		if (title === null) {
			return
		}
		// name the tab for this page, and put the shell's title back when it leaves
		document.title = toPageTitle(title, unreadBadgeCount)
		return () => {
			document.title = DEFAULT_TITLE
		}
	}, [title, unreadBadgeCount])
}
