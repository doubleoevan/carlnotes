// the chat panel widget: the pill it collapses to, the docked frame, and the title bar
import type { ChatMention } from "@shared/contracts"
import { Maximize2, Minimize2, Minus } from "lucide-react"
import type * as React from "react"
import { createPortal } from "react-dom"
import { CarlAvatar } from "@/components/branding/CarlAvatar"
import { CoffeeCup } from "@/components/branding/CoffeeCup"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { CoffeeMugs } from "@/components/branding/CoffeeMugs"
import { CoffeePot } from "@/components/branding/CoffeePot"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { ChatOptionsMenu, type ChatOptionsMenuProps } from "@/components/chat/ChatOptionsMenu"
import { DisabledRoomComposer } from "@/components/chat/ChatRoomComposer"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { ChatMentionCount, ChatMentionsTooltipBody, toChatLabel } from "@/components/topic/TopicMentionBadge"
import { cn } from "@/lib/utils"
import type { ChatPanelState } from "@/stores/chatPanelStore"

// the loading message that the chat panel shows while the chat history is loading
export function ChatMessagesLoading() {
	return (
		<div className="text-muted-foreground font-display flex min-h-24 flex-1 items-center justify-center gap-2 text-sm">
			<CoffeePot className="size-12" />
			Pouring…
		</div>
	)
}

/**
 * The panel before the conversation messages load.
 */
export function ChatLoadingPanel({
	isEnlarged,
	onPanelStateChange,
}: {
	isEnlarged: boolean
	onPanelStateChange: (next: ChatPanelState) => void
}) {
	return renderOnTop(
		<ChatPanelWidget isEnlarged={isEnlarged} onMinimizeChat={() => onPanelStateChange("collapsed")}>
			<ChatPanelHeader
				isEnlarged={isEnlarged}
				onToggleSize={() => onPanelStateChange(isEnlarged ? "open" : "enlarged")}
				onCollapse={() => onPanelStateChange("collapsed")}
			/>
			<ChatMessagesLoading />
			<DisabledRoomComposer />
		</ChatPanelWidget>,
	)
}

// the docked chat panel's placement and width
const DOCKED_CHAT_PANEL_CLASS = "bottom-safe right-3 left-3 max-h-[70dvh] sm:left-auto sm:w-[26rem] md:w-[30rem]"

// the chat panel's elevated drop shadow
const CHAT_PANEL_ELEVATION_CLASS =
	"shadow-[0_12px_28px_rgba(0,0,0,0.35),0_32px_80px_-12px_rgba(0,0,0,0.6),0_0_48px_rgba(0,0,0,0.55)] ring-1 ring-black/10 dark:ring-white/20"

// the shared widget that every chat panel renders: the enlarge overlay, and the docked section that Escape minimizes
export function ChatPanelWidget({
	isEnlarged,
	onMinimizeChat,
	children,
}: {
	isEnlarged: boolean
	onMinimizeChat: () => void
	children: React.ReactNode
}) {
	return (
		<>
			{/* only show an overlay on the page if the chat panel is enlarged */}
			{isEnlarged && <div className="fixed inset-0 z-40 bg-black/50" aria-hidden="true" />}

			{/* Escape also minimizes the chat panel */}
			<section
				aria-label="Coffee Talk"
				onKeyDown={(event) => event.key === "Escape" && onMinimizeChat()}
				className={cn(
					"bg-popover fixed z-50 flex flex-col overflow-hidden rounded-xl",
					CHAT_PANEL_ELEVATION_CLASS,
					isEnlarged ? "bottom-safe top-3 right-3 left-3 sm:inset-6" : DOCKED_CHAT_PANEL_CLASS,
				)}
			>
				{children}
			</section>
		</>
	)
}

// the minimized state is a labeled pill button with a chat mentions badge on its top right corner
export function ChatPill({ onOpenChat, chatMentions }: { onOpenChat: () => void; chatMentions?: ChatMention[] }) {
	return (
		<button
			type="button"
			onClick={onOpenChat}
			className={cn(
				"bg-primary text-primary-foreground font-display bottom-safe fixed right-3 z-50 flex items-center gap-2 rounded-full py-2.5 pr-4 pl-3 text-sm transition-transform hover:scale-105",
				CHAT_PANEL_ELEVATION_CLASS,
			)}
		>
			<CoffeeCup className="size-5.5" />
			Coffee Talk
			{chatMentions && chatMentions.length > 0 && (
				<Tooltip>
					<TooltipTrigger asChild>
						<span role="status" aria-label={toChatLabel(chatMentions)} className="absolute -top-1.5 -right-1">
							{/* the card surface, against the pill's own orange */}
							<ChatMentionCount
								chatMentions={chatMentions}
								className="bg-card text-card-foreground h-5 min-w-5 border text-xs"
							/>
						</span>
					</TooltipTrigger>
					<ChatMentionsTooltipBody chatMentions={chatMentions} />
				</Tooltip>
			)}
		</button>
	)
}

/**
 * What the chat panel title's tooltip shows: the chat room name in the panel and its avatar.
 */
export type ChatPanelTooltip = {
	chatRoomName: string
	team?: { teamId: string; name: string; hasAvatar: boolean }
	isPrivate?: boolean
}

// the chat panel title display with coffee cups
function ChatPanelTitle({
	isRoom,
	chatPanelTooltip,
	onOpenChat,
}: {
	// a chat room shows the pair of mugs while a private chat only shows one mug
	isRoom?: boolean
	chatPanelTooltip?: ChatPanelTooltip
	// opens the chat list. if there is no list to open, there is no callback
	onOpenChat?: () => void
}) {
	const title = (
		<>
			{isRoom ? (
				<CoffeeMugs className="h-4 w-auto shrink-0 -translate-y-1" />
			) : (
				<CoffeeMug className="size-5 shrink-0" />
			)}
			<h2 className="font-display text-lg leading-none">Coffee Talk</h2>
		</>
	)
	if (!onOpenChat) {
		return <span className="flex flex-1 items-center gap-2">{title}</span>
	}
	// the entire chat panel title triggers the tooltip on hover
	const chatPanelTitle = (
		<button
			type="button"
			aria-label="Open the chat list"
			onClick={onOpenChat}
			className="flex flex-1 items-center gap-2"
		>
			{title}
		</button>
	)
	if (!chatPanelTooltip) {
		return chatPanelTitle
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>{chatPanelTitle}</TooltipTrigger>
			<TooltipContent className="flex items-center gap-2">
				{chatPanelTooltip.team ? (
					<TeamAvatar team={chatPanelTooltip.team} className="size-4" />
				) : chatPanelTooltip.isPrivate ? (
					<CarlAvatar className="size-4" />
				) : null}
				{chatPanelTooltip.chatRoomName}
			</TooltipContent>
		</Tooltip>
	)
}

// the chat panel title bar with the options menu, enlarge, and minimize buttons
export function ChatPanelHeader({
	isEnlarged,
	isRoom,
	onToggleSize,
	onCollapse,
	chatRoomMenu,
	chatPanelTooltip,
}: {
	isEnlarged: boolean
	// a chat room shows the pair of mugs while a private chat only shows one mug
	isRoom?: boolean
	onToggleSize: () => void
	onCollapse: () => void
	// what the Ellipsis (...) chat options menu shows. absent when it has no row to show
	chatRoomMenu?: ChatOptionsMenuProps
	// the tooltip for the chat panel title indicating the current chat room's name and avatar
	chatPanelTooltip?: ChatPanelTooltip
}) {
	return (
		<header className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
			{/* the chat panel title shows the open conversation on hover and opens the chat rooms list on a press */}
			{chatRoomMenu ? (
				<ChatOptionsMenu
					{...chatRoomMenu}
					renderChatTitle={(onOpen) => (
						<ChatPanelTitle isRoom={isRoom} chatPanelTooltip={chatPanelTooltip} onOpenChat={onOpen} />
					)}
				/>
			) : (
				<ChatPanelTitle isRoom={isRoom} chatPanelTooltip={chatPanelTooltip} />
			)}
			{/* the buttons are grouped to the right */}
			<div className="flex items-center gap-0.5">
				{/* the size toggle reads as an "expand" and "collapse" pair */}
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={isEnlarged ? "Collapse" : "Expand"}
							onClick={onToggleSize}
							className="text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-md"
						>
							{isEnlarged ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
						</button>
					</TooltipTrigger>
					<TooltipContent>{isEnlarged ? "Collapse" : "Expand"}</TooltipContent>
				</Tooltip>
				{/* the "minimize" dash closes the panel to its pill */}
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="Minimize"
							onClick={onCollapse}
							className="text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-md"
						>
							<Minus className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent>Minimize</TooltipContent>
				</Tooltip>
			</div>
		</header>
	)
}

// render into the body instead of into the app layout's box for the highest z-index possible
export function renderOnTop(children: React.ReactNode): React.ReactPortal {
	return createPortal(children, document.body)
}
