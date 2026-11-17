import { cn } from "@carlnotes/nightshift/classNames"
import { Check, Users } from "lucide-react"
import { type KeyboardEvent, useRef, useState } from "react"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { CountBadge } from "@/components/common/CountBadge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { MENU_OPTION_CLASS, MENU_OPTION_SELECTED_CLASS } from "@/lib/styleClasses"
import { isWideScreen } from "@/lib/utils"
import type { ChatRoomOption } from "./ChatOptionsMenu"

type ChatRoomMenuRowProps = { room: ChatRoomOption; onSelect: () => void }

/**
 * Selects a chat room or opens its page from the tooltip beside the row.
 */
export function ChatRoomMenuRow({ room, onSelect }: ChatRoomMenuRowProps) {
	// track tooltip visibility and the elements that exchange keyboard focus
	const [isTooltipOpen, setIsTooltipOpen] = useState(false)
	const rowRef = useRef<HTMLButtonElement>(null)
	const linkRef = useRef<HTMLAnchorElement>(null)

	// move keyboard focus from the row to its tooltip link on Left Arrow
	function handleRowKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
		if (
			!isTooltipOpen ||
			event.key !== "ArrowLeft" ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.shiftKey
		) {
			return
		}
		event.preventDefault()
		linkRef.current?.focus()
	}

	return (
		<Tooltip open={isTooltipOpen} onOpenChange={setIsTooltipOpen}>
			{/* chat room button */}
			<TooltipTrigger asChild>
				<button
					ref={rowRef}
					type="button"
					aria-keyshortcuts="ArrowLeft"
					onClick={onSelect}
					onKeyDown={handleRowKeyDown}
					onBlur={(event) => {
						// keep the tooltip open while focus moves to the title link
						if (event.relatedTarget === linkRef.current && linkRef.current) {
							event.preventDefault()
						}
					}}
					className={cn(MENU_OPTION_CLASS, room.isActive && MENU_OPTION_SELECTED_CLASS)}
				>
					<TeamAvatar team={room.team} className="size-5 shrink-0" />
					<span className={cn("min-w-0 flex-1 truncate", room.isHighlighted && "text-link font-medium")}>
						{room.name}
					</span>
					{room.isTeamRoom && <Users className="text-muted-foreground size-3.5 shrink-0" />}
					{room.chatMentions && room.chatMentions.length > 0 && (
						<CountBadge count={room.chatMentions.length} className="h-5 min-w-5 shrink-0 text-xs" />
					)}
					{room.isActive && <Check className="text-primary size-4 shrink-0" />}
				</button>
			</TooltipTrigger>
			{/* page link and chat room members */}
			<TooltipContent
				side={isTooltipOpen && !isWideScreen() ? "bottom" : "left"}
				sideOffset={8}
				hideWhenDetached
				aria-label={`${room.name} chat details`}
				className="max-w-64"
				onEscapeKeyDown={() => {
					if (linkRef.current?.matches(":focus")) {
						rowRef.current?.focus()
					}
				}}
			>
				<AnchorLink
					href={room.pageHref}
					ref={linkRef}
					onBlur={() => setIsTooltipOpen(false)}
					className="rounded-sm font-semibold underline focus-visible:outline-2"
				>
					{room.name}
				</AnchorLink>
				{room.team.name !== room.name && <p className="text-primary-foreground/80 text-xs">{room.team.name}</p>}
				{room.chatRoomMembers && room.chatRoomMembers.length > 0 && (
					<ul className="mt-1.5 space-y-1">
						{room.chatRoomMembers.map((member) => (
							<li key={member.userId} className="flex items-center gap-1.5">
								<UserAvatar {...member} className="size-4" />
								{member.username}
							</li>
						))}
					</ul>
				)}
			</TooltipContent>
		</Tooltip>
	)
}
