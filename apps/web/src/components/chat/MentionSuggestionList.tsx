// the @ mention autocomplete behind the chat room composer: the suggestions, the hook that owns them, and the list
import { toActiveChatMention, toChatMentionSuggestions, toInsertedChatMention } from "@carlnotes/core/lib/chatMentions"

export { toChatMentionSuggestions } from "@carlnotes/core/lib/chatMentions"

import { cn } from "@carlnotes/nightshift/classNames"
import { useState } from "react"

// what the autocomplete shows the composer: the open list and the handlers the chat message box wires in
type MentionAutocomplete = {
	usernameSuggestions: string[]
	highlightMentionIndex: number
	readMentionQuery: (chatMessageStart: string) => void
	selectMentionedUsername: (username: string) => void
	handleAutocompleteKey: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean
	closeMentionList: () => void
}

/** Owns the @ autocomplete behind the chat message box: the typed prefix, the highlighted username, and its keys. */
export function useMentionAutocomplete(options: {
	memberUsernames: string[]
	chatMessage: string
	setChatMessage: (chatMessage: string) => void
	chatMessageBoxRef: React.RefObject<HTMLTextAreaElement | null>
}): MentionAutocomplete {
	const { memberUsernames, chatMessage, setChatMessage, chatMessageBoxRef } = options
	const [mentionQuery, setMentionQuery] = useState<string | null>(null)
	const [highlightMentionIndex, setHighlightMentionIndex] = useState(0)

	// carl is suggested first, then the chat members, narrowed by the typed prefix
	const usernameSuggestions = mentionQuery === null ? [] : toChatMentionSuggestions(mentionQuery, memberUsernames)

	// each keystroke re-reads the token behind the caret to suggest the users to mention
	const readMentionQuery = (chatMessageStart: string): void => {
		setMentionQuery(toActiveChatMention(chatMessageStart))
		setHighlightMentionIndex(0)
	}

	// selecting a username replaces the typed prefix and puts the caret after it
	const selectMentionedUsername = (username: string): void => {
		const chatMessageBox = chatMessageBoxRef.current
		if (!chatMessageBox) {
			return
		}

		// selecting a username replaces the typed prefix with the full one
		const caret = chatMessageBox.selectionStart ?? chatMessage.length
		const insertedChatMention = toInsertedChatMention({ message: chatMessage, caret, username })
		setChatMessage(insertedChatMention.message)
		setMentionQuery(null)
		chatMessageBox.focus()
	}

	// while the autocomplete is open, it owns the arrows, Enter, Tab, and Escape
	const handleAutocompleteKey = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault()
			const step = event.key === "ArrowDown" ? 1 : -1
			setHighlightMentionIndex((index) => (index + step + usernameSuggestions.length) % usernameSuggestions.length)
			return true
		}

		// enter and tab select the highlighted username
		if (event.key === "Enter" || event.key === "Tab") {
			event.preventDefault()
			const username = usernameSuggestions[highlightMentionIndex]
			if (username) {
				selectMentionedUsername(username)
			}
			return true
		}

		// escape closes the list without touching the chat message
		if (event.key === "Escape") {
			event.stopPropagation()
			setMentionQuery(null)
			return true
		}
		return false
	}

	// the composer clears the list after a post, so a sent draft never leaves suggestions floating
	return {
		usernameSuggestions,
		highlightMentionIndex,
		readMentionQuery,
		selectMentionedUsername,
		handleAutocompleteKey,
		closeMentionList: () => setMentionQuery(null),
	}
}

/** The username list showing above the chat message box, carl pinned first then the chat members. */
export function MentionSuggestionList({ autocomplete }: { autocomplete: MentionAutocomplete }) {
	return (
		<ul className="bg-popover absolute right-3 bottom-full left-3 z-10 mb-1 overflow-hidden rounded-md border shadow-raised">
			{autocomplete.usernameSuggestions.map((username, index) => (
				<li key={username}>
					<button
						type="button"
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => autocomplete.selectMentionedUsername(username)}
						className={cn(
							"w-full px-3 py-1.5 text-left text-sm",
							index === autocomplete.highlightMentionIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
						)}
					>
						@{username}
					</button>
				</li>
			))}
		</ul>
	)
}
