// the chat room switcher, a row under the title that opens the chat room list
import type { ChatMention } from "@shared/contracts"
import { Check, ChevronsUpDown, Trash2, Users } from "lucide-react"
import { useState } from "react"
import { CarlAvatar } from "@/components/branding/CarlAvatar"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { ChatMentionCount } from "@/components/topic/TopicMentionBadge"
import { MENU_OPTION_CLASS, MENU_OPTION_SELECTED_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { useAllChatMentions } from "@/stores/chatRoomStore"

/** A chat room the panel can switch to: a team's own conversation, or one about a topic it holds. */
export type ChatRoomOption = {
	key: string
	name: string
	isActive: boolean
	// the team the chat room belongs to, shown as its avatar
	team: { teamId: string; name: string; hasAvatar: boolean }
	// whether to highlight the chat room option because it belongs to the current page's team or topic
	isHighlighted?: boolean
	// a team's own chat room, marked with the team icon
	isTeamRoom?: boolean
	// the chat mentions for the badge and tooltip
	chatMentions?: ChatMention[]
	// the chat room members that the chat room option's hover tooltip lists
	chatRoomMembers?: { userId: string; username: string; avatarSource: string | null }[]
	onSelect: () => void
}

// the chat room switcher row and what it may show
export type ChatOptionsMenuProps = {
	// every chat room the user can switch to, absent where there is only one
	chatRoomOptions?: ChatRoomOption[]
	// opens the user's own conversation about this topic, absent where there is no topic
	onPrivateChat?: () => void
	// the Clear chat row: the private chat's own, or the chat room's for a team leader
	onClear?: () => void
	// the Clear row's label, naming the conversation it empties
	clearLabel?: string
	// a callback to update the chat room list
	onOpenChatRoomMenu?: () => void
}

// the switcher props a chat room panel passes through, without the Clear row it adds itself
export type ChatRoomMenu = Pick<ChatOptionsMenuProps, "chatRoomOptions" | "onPrivateChat" | "onOpenChatRoomMenu">

/**
 * Whether the switcher row has anything to show: another chat room, private chat, or clear.
 */
export function hasChatOptions(menu: ChatOptionsMenuProps): boolean {
	return Boolean(menu.onPrivateChat || menu.onClear || menu.chatRoomOptions?.length)
}

// the avatar and name the trigger shows for the chat room currently open, whether a team chat room or the private chat
export type CurrentChatRoomOption = {
	name: string
	team?: { teamId: string; name: string; hasAvatar: boolean }
	isPrivate?: boolean
}

// the dropdown row under the title: the chat rooms to switch to, the private chat, and clear
export function ChatOptionsMenu({
	chatRoomOptions,
	onPrivateChat,
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
	if (!hasChatOptions({ chatRoomOptions, onPrivateChat, onClear })) {
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
						<CarlAvatar className="size-5 shrink-0" />
					) : null}
					<span className="min-w-0 flex-1 truncate font-medium">{currentChatRoom?.name ?? "Select a chat"}</span>
					{chatMentions.length > 0 && (
						<ChatMentionCount chatMentions={chatMentions} className="h-5 min-w-5 shrink-0 text-xs" />
					)}
					<ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
				</button>
			</PopoverTrigger>
			{/* a chat room row holds a topic name and needs more width than the fixed rows */}
			<PopoverContent align="end" className={chatRoomOptions?.length ? "w-72" : "w-44"} bodyClassName="p-1">
				{/* the private chat goes first if it's available */}
				{onPrivateChat && (
					<button type="button" onClick={() => handleSelectChatOption(onPrivateChat)} className={MENU_OPTION_CLASS}>
						{/* the private chat is with carl alone, marked with his avatar */}
						<CarlAvatar className="size-5" />
						Private chat
					</button>
				)}
				{/* then the selected chat room, then the rest alphabetically */}
				{chatRoomOptions?.map((chatRoomOption) => (
					<Tooltip key={chatRoomOption.key}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={() => handleSelectChatOption(chatRoomOption.onSelect)}
								// the open chat room gets the same highlight background as its trigger row
								className={cn(MENU_OPTION_CLASS, chatRoomOption.isActive && MENU_OPTION_SELECTED_CLASS)}
							>
								{/* the team's avatar shows the chat room's team */}
								<span className="flex shrink-0 items-center">
									<TeamAvatar team={chatRoomOption.team} className="size-5" />
								</span>
								<span
									className={cn("min-w-0 flex-1 truncate", chatRoomOption.isHighlighted && "text-primary font-medium")}
								>
									{chatRoomOption.name}
								</span>
								{/* a team and one of its topics can share a name. the team option shows an icon */}
								{chatRoomOption.isTeamRoom && <Users className="text-muted-foreground size-3.5 shrink-0" />}
								{chatRoomOption.chatMentions && chatRoomOption.chatMentions.length > 0 && (
									<ChatMentionCount
										chatMentions={chatRoomOption.chatMentions}
										className="h-5 min-w-5 shrink-0 text-xs"
									/>
								)}
								{chatRoomOption.isActive && <Check className="text-primary size-4 shrink-0" />}
							</button>
						</TooltipTrigger>
						{/* who is in the chat room, shown off to the side */}
						<TooltipContent side="left" sideOffset={8}>
							<p className="font-semibold">{chatRoomOption.name}</p>
							{/* the team name is muted in the tooltip's own palette */}
							{chatRoomOption.team.name !== chatRoomOption.name && (
								<p className="text-primary-foreground/80 text-xs">{chatRoomOption.team.name}</p>
							)}
							{(chatRoomOption.chatRoomMembers ?? []).length > 0 && (
								<ul className="mt-1.5 space-y-1">
									{(chatRoomOption.chatRoomMembers ?? []).map((chatRoomMember) => (
										<li key={chatRoomMember.userId}>
											<span className="inline-flex items-center gap-1.5">
												<UserAvatar
													userId={chatRoomMember.userId}
													username={chatRoomMember.username}
													avatarSource={chatRoomMember.avatarSource}
													className="size-4"
												/>
												{chatRoomMember.username}
											</span>
										</li>
									))}
								</ul>
							)}
						</TooltipContent>
					</Tooltip>
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
