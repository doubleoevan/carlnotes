import { useEffect } from "react"
import { useAllChatMentions } from "@/stores/chatRoomStore"
import { useAllNoteCount } from "@/stores/noteBadgeStore"

// the shell's own title, put back when a page leaves
const DEFAULT_TITLE = "CarlNotes — He already read it. All of it."

// the tab title, with the unread count leading it while anything waits
function toPageTitle(name: string, unreadCount: number): string {
	const pageTitle = `${name} — CarlNotes`
	return unreadCount > 0 ? `(${unreadCount}) ${pageTitle}` : pageTitle
}

/**
 * Name the browser tab after the page on screen, in the shape the server writes into the shell.
 * The unread chat and note count leads it. Pass null while the name is loading to keep the last title.
 */
export function usePageTitle(name: string | null): void {
	// everything waiting for the user to view, chats and notes summed
	const unreadCount = useAllChatMentions().length + useAllNoteCount()
	useEffect(() => {
		// a page still loading its name keeps whatever title the last one set
		if (name === null) {
			return
		}
		// name the tab for this page, and put the shell's title back when it leaves
		document.title = toPageTitle(name, unreadCount)
		return () => {
			document.title = DEFAULT_TITLE
		}
	}, [name, unreadCount])
}
