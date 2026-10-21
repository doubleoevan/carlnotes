// the reply target dropdown of the chat room composer, and the chat message helpers that swap its chat mention

import type { ChatRoomMessage } from "@carlnotes/contracts/chat"
import { ALL_USERNAME, CARL_USERNAME } from "@carlnotes/contracts/chatMentions"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "@carlnotes/contracts/podcastEpisodes"
import { ChevronDown, Reply } from "lucide-react"
import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { MENU_OPTION_CLASS, MENU_OPTION_SELECTED_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/** The reply to user dropdown menu. */
export function ReplyToDropdown({
	currentReplyUser,
	replyChatMessages,
	onSelectReplyTo,
}: {
	currentReplyUser: string
	replyChatMessages: { username: string; chatMessage: ChatRoomMessage }[]
	onSelectReplyTo: (selectedChatMessage: { username: string; chatMessage: ChatRoomMessage } | "all" | "carl") => void
}) {
	const [isOpen, setIsOpen] = useState(false)

	// selecting closes the menu and passes the chat message to the callback
	const handleSelectReplyTo = (
		selectedChatMessage: { username: string; chatMessage: ChatRoomMessage } | "all" | "carl",
	): void => {
		setIsOpen(false)
		onSelectReplyTo(selectedChatMessage)
	}

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="Pick who to reply to"
					className="text-muted-foreground hover:text-foreground mb-1.5 flex items-center gap-1.5 text-xs"
				>
					<Reply className="size-3" />
					{`Replying to ${currentReplyUser}`}
					<ChevronDown className="size-3" />
				</button>
			</PopoverTrigger>
			{/* the current reply target's row shows the selected tint */}
			<PopoverContent align="start" className="w-44" bodyClassName="p-1">
				{/* @all reaches the whole room and starts carl's turn beside it */}
				<button
					type="button"
					onClick={() => handleSelectReplyTo("all")}
					className={cn(MENU_OPTION_CLASS, currentReplyUser === "@all" && MENU_OPTION_SELECTED_CLASS)}
				>
					@all
				</button>
				{!replyChatMessages.some((chatMessage) => chatMessage.username === PODCAST_EPISODE_SPEAKER_NAMES.host) && (
					<button
						type="button"
						onClick={() => handleSelectReplyTo("carl")}
						className={cn(
							MENU_OPTION_CLASS,
							currentReplyUser === PODCAST_EPISODE_SPEAKER_NAMES.host && MENU_OPTION_SELECTED_CLASS,
						)}
					>
						{PODCAST_EPISODE_SPEAKER_NAMES.host}
					</button>
				)}
				{replyChatMessages.map((chatMessage) => (
					<button
						key={chatMessage.username}
						type="button"
						onClick={() => handleSelectReplyTo(chatMessage)}
						className={cn(MENU_OPTION_CLASS, currentReplyUser === chatMessage.username && MENU_OPTION_SELECTED_CLASS)}
					>
						{chatMessage.username}
					</button>
				))}
			</PopoverContent>
		</Popover>
	)
}

/** Returns what the menu calls a chat mention: carl by name, @all as typed, anyone else by their username. */
export function toMentionLabel(username: string): string {
	if (username === CARL_USERNAME) {
		return PODCAST_EPISODE_SPEAKER_NAMES.host
	}
	return username === ALL_USERNAME ? "@all" : username
}

/** Swaps the current chat mention for the selected chat mention if there is one. */
export function toChangedMentionChatMessage(chatMessage: string, username: string, memberUsernames: string[]): string {
	return `@${username} ${toChatMessage(chatMessage, memberUsernames)}`
}

/** Returns the chat message without its leading chat mention. */
export function toChatMessage(chatMessage: string, memberUsernames: string[]): string {
	const currentMentions = chatMessage.match(/^@([\w-]+)\s*/)
	const chatUsernames = [
		CARL_USERNAME,
		ALL_USERNAME,
		...memberUsernames.map((memberUsername) => memberUsername.toLowerCase()),
	]
	if (currentMentions && chatUsernames.includes((currentMentions[1] ?? "").toLowerCase())) {
		return chatMessage.slice(currentMentions[0].length)
	}
	return chatMessage
}
