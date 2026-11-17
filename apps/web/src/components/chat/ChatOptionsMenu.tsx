// the chat room switcher, a row under the title that opens the chat room list
import type { ChatMention } from "@carlnotes/contracts/chat"
import { NEW_TOPIC_CHAT_COPY, toPrivateChatLabel } from "@carlnotes/core/lib/chatCopy"
import { useAllChatMentions } from "@carlnotes/core/stores/chatRoomStore"
import { ChevronDown, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { HostAvatar } from "@/components/branding/HostAvatar"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { CountBadge } from "@/components/common/CountBadge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { MENU_OPTION_CLASS } from "@/lib/styleClasses"
import { ChatRoomMenuRow } from "./ChatRoomMenuRow"

/** A chat room the panel can switch to: a team's own conversation, or one about a topic it holds. */
export type ChatRoomOption = {
	key: string
	name: string
	pageHref: string
	isActive: boolean
	// the team the chat room belongs to, shown as its avatar
	team: { teamId: string; name: string; avatarVersion: string | null }
	// whether to highlight the chat room option because it belongs to the current page's team or topic
	isHighlighted?: boolean
	// a team's own chat room, marked with the team icon
	isTeamRoom?: boolean
	// the chat mentions for the badge and tooltip
	chatMentions?: ChatMention[]
	// the chat room members shown in the tooltip
	chatRoomMembers?: { userId: string; username: string; avatarVersion: string | null }[]
	onSelect: () => void
}

// the chat room switcher row and what it may show
export type ChatOptionsMenuProps = {
	// every chat room the user can switch to, absent where there is only one
	chatRoomOptions?: ChatRoomOption[]
	// opens the user's own conversation about this topic, absent where there is no topic
	onPrivateChat?: () => void
	// what the private chat's option reads, naming what that chat is about
	privateChatLabel?: string
	// opens the new-topic chat, where carl makes a topic. absent for a visitor
	onNewTopicChat?: () => void
	// the Clear chat row: the private chat's own, or the chat room's for a team leader
	onClear?: () => void
	// the Clear row's label, naming the conversation it empties
	clearLabel?: string
	// a callback to update the chat room list
	onOpenChatRoomMenu?: () => void
}

// the switcher props a chat room panel passes through, without the Clear row it adds itself
export type ChatRoomMenu = Pick<
	ChatOptionsMenuProps,
	"chatRoomOptions" | "onPrivateChat" | "privateChatLabel" | "onNewTopicChat" | "onOpenChatRoomMenu"
>

/**
 * Whether the switcher row has anything to show: another chat room, private chat, or clear.
 */
export function hasChatOptions(menu: ChatOptionsMenuProps): boolean {
	return Boolean(menu.onPrivateChat || menu.onNewTopicChat || menu.onClear || menu.chatRoomOptions?.length)
}

// the avatar and name the trigger shows for the chat room currently open, whether a team chat room or the private chat
export type CurrentChatRoomOption = {
	name: string
	team?: { teamId: string; name: string; avatarVersion: string | null }
	isPrivate?: boolean
}

// the dropdown row under the title: the chat rooms to switch to, the private chat, and clear
export function ChatOptionsMenu({
	chatRoomOptions,
	onPrivateChat,
	privateChatLabel = toPrivateChatLabel(),
	onNewTopicChat,
	onClear,
	clearLabel,
	onOpenChatRoomMenu,
	currentChatRoom,
}: ChatOptionsMenuProps & { currentChatRoom?: CurrentChatRoomOption }) {
	const [isOpen, setIsOpen] = useState(false)
	// selecting a chat option closes the menu and runs the callback
	const handleSelectChatOption = (onSelectChatOption: () => void): void => {
		setIsOpen(false)
		onSelectChatOption()
	}

	// opening the menu runs onOpenMenu to update the list
	const handleOpenMenuChange = (isOpening: boolean): void => {
		setIsOpen(isOpening)
		if (isOpening) {
			onOpenChatRoomMenu?.()
		}
	}

	// every chat mention across the app, for the badge on the trigger row
	const chatMentions = useAllChatMentions()

	// nothing to switch to and nothing to clear. no row to show
	if (!hasChatOptions({ chatRoomOptions, onPrivateChat, onNewTopicChat, onClear })) {
		return null
	}

	return (
		<Popover open={isOpen} onOpenChange={handleOpenMenuChange}>
			{/* the row names the open chat room and doubles as the trigger. its background fills edge to edge,
			    its content inset to match the title above it */}
			<PopoverTrigger asChild>
				<button
					type="button"
					className="bg-primary/15 hover:bg-accent flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left text-sm sm:min-h-10"
				>
					{currentChatRoom?.team ? (
						<TeamAvatar team={currentChatRoom.team} className="size-5 shrink-0" />
					) : currentChatRoom?.isPrivate ? (
						<HostAvatar speaker="host" className="size-5 shrink-0" />
					) : null}
					{/* a long name ends in an ellipsis on its one line, and the title shows it whole */}
					<span className="min-w-0 flex-1 truncate font-medium" title={currentChatRoom?.name}>
						{currentChatRoom?.name ?? "Select a chat"}
					</span>
					{chatMentions.length > 0 && (
						<CountBadge count={chatMentions.length} className="h-5 min-w-5 shrink-0 text-xs" />
					)}
					<ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
				</button>
			</PopoverTrigger>
			{/* a chat room row holds a topic name and needs more width than the fixed rows */}
			<PopoverContent align="end" className={chatRoomOptions?.length ? "w-72" : "w-44"} bodyClassName="p-1">
				{/* the private chat goes first if it's available */}
				{onPrivateChat && (
					<button type="button" onClick={() => handleSelectChatOption(onPrivateChat)} className={MENU_OPTION_CLASS}>
						{/* the private chat is with carl alone, marked with his avatar, and named for what it is about */}
						<HostAvatar speaker="host" className="size-5 shrink-0" />
						<span className="min-w-0 flex-1 truncate" title={privateChatLabel}>
							{privateChatLabel}
						</span>
					</button>
				)}
				{/* the new-topic chat, where carl makes a topic */}
				{onNewTopicChat && (
					<button type="button" onClick={() => handleSelectChatOption(onNewTopicChat)} className={MENU_OPTION_CLASS}>
						<Plus className="text-muted-foreground size-5" />
						{NEW_TOPIC_CHAT_COPY.name}
					</button>
				)}
				{/* chat rooms in alphabetical order */}
				{chatRoomOptions?.map((chatRoomOption) => (
					<ChatRoomMenuRow
						key={chatRoomOption.key}
						room={chatRoomOption}
						onSelect={() => handleSelectChatOption(chatRoomOption.onSelect)}
					/>
				))}
				{onClear && (
					<button type="button" onClick={() => handleSelectChatOption(onClear)} className={MENU_OPTION_CLASS}>
						<Trash2 className="size-4 shrink-0" />
						<span className="min-w-0 flex-1 truncate">{clearLabel ?? "Clear chat"}</span>
					</button>
				)}
			</PopoverContent>
		</Popover>
	)
}
