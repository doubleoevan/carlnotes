// the reply target dropdown of the chat room composer, and the chat message helpers that swap its chat mention

import type { ChatRoomMessage } from "@carlnotes/contracts/chat"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "@carlnotes/contracts/podcastEpisodes"
import { cn } from "@carlnotes/nightshift/classNames"
import { ChevronDown, Reply } from "lucide-react"
import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { MENU_OPTION_CLASS, MENU_OPTION_SELECTED_CLASS } from "@/lib/styleClasses"

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

export { toChangedMentionChatMessage, toChatMessage, toMentionLabel } from "@carlnotes/core/lib/chatMentions"
