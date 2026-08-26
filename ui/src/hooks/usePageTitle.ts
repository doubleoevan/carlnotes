import { useEffect } from "react"
import { useAllChatMentions } from "@/stores/chatRoomStore"

// the shell's own title, which the home page keeps and every other page restores when it leaves
const DEFAULT_TITLE = "CarlNotes — He already read it. All of it."

// the count the tab shows while chats wait
function toTitle(name: string, chatMentionCount: number): string {
	const pageTitle = `${name} — CarlNotes`
	return chatMentionCount > 0 ? `(${chatMentionCount}) ${pageTitle}` : pageTitle
}

/**
 * Name the browser tab after the page on screen, in the shape the server writes into the shell.
 * The server's title only covers the first load, so a page sets its own as the reader navigates.
 * Pass null while the name is still loading, which leaves the last title in place instead of flashing.
 * The unseen chat mention count leads the title, which is the only badge a tab in the background can show.
 */
export function usePageTitle(name: string | null): void {
	const chatMentionCount = useAllChatMentions().length
	useEffect(() => {
		// a page still loading its name keeps whatever title the last one set
		if (name === null) {
			return
		}
		// the shell's title comes back when this page leaves, so the next one never inherits it
		document.title = toTitle(name, chatMentionCount)
		return () => {
			document.title = DEFAULT_TITLE
		}
	}, [name, chatMentionCount])
}
