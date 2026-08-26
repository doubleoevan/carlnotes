// the ellipsis (...) menu on the title bar
import type { ChatMention } from "@shared/contracts"
import { Check, Ellipsis, Trash2, Users } from "lucide-react"
import type * as React from "react"
import { useState } from "react"
import { CarlAvatar } from "@/components/branding/CarlAvatar"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { ChatMentionCount, toChatLabel } from "@/components/topic/TopicMentionBadge"
import { cn } from "@/lib/utils"
import { useAllChatMentions } from "@/stores/chatRoomStore"

// a row inside the ellipsis (...) dropdown menu
const CHAT_MENU_OPTION_CLASS =
	"hover:bg-accent flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm"

/** A chat room the panel can switch to: a team's own conversation, or one about a topic it holds. */
export type ChatRoomOption = {
	key: string
	name: string
	isActive: boolean
	// the team the chat room belongs to, shown as its avatar. it is what tells two chat rooms for the same topic apart
	team: { teamId: string; name: string; hasAvatar: boolean }
	// whether to highlight the chat room option because it belongs to the current page's team or topic
	isHighlighted?: boolean
	// a team's chat room, marked with the team icon so it can be told apart from a topic with the same name
	isTeamRoom?: boolean
	// the chat mentions for the badge and tooltip
	chatMentions?: ChatMention[]
	onSelect: () => void
}

// the ellipsis (...) menu on the title bar
export type ChatOptionsMenuProps = {
	// every chat room the user can switch to, absent where there is only one
	chatRoomOptions?: ChatRoomOption[]
	// opens the user's own conversation about this topic, absent where there is no topic to have one about
	onPrivateChat?: () => void
	// the Clear chat row: the private chat's own, or the room's for a team leader
	onClear?: () => void
	// what that row says, which names the conversation it would empty
	clearLabel?: string
	// a callback to update the chat room list
	onOpenMenu?: () => void
}

// the ellipsis (...) menu on the title bar, and the title beside it that opens the same menu
export function ChatOptionsMenu({
	chatRoomOptions,
	onPrivateChat,
	onClear,
	clearLabel,
	onOpenMenu,
	renderChatTitle,
}: ChatOptionsMenuProps & { renderChatTitle: (onOpen: () => void) => React.ReactNode }) {
	const [isOpen, setIsOpen] = useState(false)
	// selecting a chat option closes the menu and runs the callback
	const handleSelectChatOption = (onSelectChatOption: () => void): void => {
		setIsOpen(false)
		onSelectChatOption()
	}

	// when the menu is opening, the onOpen callback is run to update the list
	const handleOpenMenuChange = (isOpening: boolean): void => {
		setIsOpen(isOpening)
		if (isOpening) {
			onOpenMenu?.()
		}
	}

	// the entire app's chat mention count, which shows up in the badge that opens this menu
	const chatMentions = useAllChatMentions()

	// only show the title if there are no chat options
	if (!onPrivateChat && !onClear && !chatRoomOptions?.length) {
		return renderChatTitle(() => {})
	}

	return (
		<Popover open={isOpen} onOpenChange={handleOpenMenuChange}>
			{renderChatTitle(() => handleOpenMenuChange(true))}
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={chatMentions.length > 0 ? `Chat options, ${toChatLabel(chatMentions)}` : "Chat options"}
					className="text-muted-foreground hover:text-foreground flex h-8 items-center gap-1.5 rounded-md px-1"
				>
					{chatMentions.length > 0 && <ChatMentionCount chatMentions={chatMentions} className="h-5 min-w-5 text-xs" />}
					<Ellipsis className="size-4" />
				</button>
			</PopoverTrigger>
			{/* a chat room row holds a topic name, which needs more width than the fixed rows do */}
			{/* nothing takes focus on open, so no row starts with the browser's focus ring */}
			<PopoverContent
				align="end"
				className={cn("p-1", chatRoomOptions?.length ? "w-72" : "w-44")}
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
				{/* the private chat goes first if it's available */}
				{onPrivateChat && (
					<button
						type="button"
						onClick={() => handleSelectChatOption(onPrivateChat)}
						className={CHAT_MENU_OPTION_CLASS}
					>
						{/* the private chat is with carl alone, so his avatar stands where a room row's team goes */}
						<CarlAvatar className="size-5" />
						Private chat
					</button>
				)}
				{/* then the selected chat room, then the rest alphabetically */}
				{chatRoomOptions?.map((chatRoomOption) => (
					<button
						key={chatRoomOption.key}
						type="button"
						onClick={() => handleSelectChatOption(chatRoomOption.onSelect)}
						className={CHAT_MENU_OPTION_CLASS}
					>
						{/* the team's avatar shows the chat room's team */}
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="flex shrink-0 items-center">
									<TeamAvatar team={chatRoomOption.team} className="size-5" />
								</span>
							</TooltipTrigger>
							<TooltipContent>{chatRoomOption.team.name}</TooltipContent>
						</Tooltip>
						<span className={cn("min-w-0 flex-1 truncate", chatRoomOption.isHighlighted && "text-primary font-medium")}>
							{chatRoomOption.name}
						</span>
						{/* a team and one of its topics can share a name so the team option shows an icon */}
						{chatRoomOption.isTeamRoom && <Users className="text-muted-foreground size-3.5 shrink-0" />}
						{chatRoomOption.chatMentions && chatRoomOption.chatMentions.length > 0 && (
							<ChatMentionCount chatMentions={chatRoomOption.chatMentions} className="h-5 min-w-5 shrink-0 text-xs" />
						)}
						{chatRoomOption.isActive && <Check className="text-primary size-4 shrink-0" />}
					</button>
				))}
				{onClear && (
					<button type="button" onClick={() => handleSelectChatOption(onClear)} className={CHAT_MENU_OPTION_CLASS}>
						<Trash2 className="size-4 shrink-0" />
						<span className="min-w-0 flex-1 truncate">{clearLabel ?? "Clear chat"}</span>
					</button>
				)}
			</PopoverContent>
		</Popover>
	)
}
