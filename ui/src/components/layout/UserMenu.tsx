import { Activity, CircleUserRound, Columns3Cog, LogOut, ShieldUser, User, Users } from "lucide-react"
import { useState } from "react"
import { useLocation } from "react-router-dom"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { DocsLink } from "@/components/layout/DocsLink"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { SignOutDialog } from "@/components/session/SignOutDialog"
import { ChatMentionCount, toChatLabel } from "@/components/topic/TopicMentionBadge"
import { cn } from "@/lib/utils"
import { useAllChatMentions, useAllTeamMentions, useAllTopicMentions } from "@/stores/chatRoomStore"

// the row styling shared by every item in the user menu and the mobile menu the menu opens with its first row
export const MENU_ITEM_CLASS =
	"hover:bg-accent focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm outline-none focus-visible:ring-[3px] [&:not(:first-child)]:mt-0.5"

// a menu row's classes that highlight the current page
export function menuItemClassName(pathname: string, href: string): string {
	return cn(MENU_ITEM_CLASS, pathname === href && "bg-accent")
}

/**
 * The wide-screen user menu is a dropdown opened from the signed-in user's avatar.
 */
export function UserMenu({
	userId,
	username,
	avatarSource,
	isAdmin,
}: {
	userId: string
	username: string
	avatarSource?: string | null
	isAdmin: boolean
}) {
	// every unseen chat mention across every chat, for the badge on the avatar
	const chatMentions = useAllChatMentions()

	// controlled so the menu closes on item click and navigation
	const [isOpen, setIsOpen] = useState(false)
	const handleCloseMenu = (): void => {
		setIsOpen(false)
	}

	// the sign-out confirmation dialog replaces the user menu instead of sitting over it
	const [isConfirmingSignOut, setIsConfirmingSignOut] = useState(false)
	const handleConfirmSignOut = (): void => {
		setIsConfirmingSignOut(true)
		handleCloseMenu()
	}

	return (
		<>
			<Popover open={isOpen && !isConfirmingSignOut} onOpenChange={setIsOpen}>
				<PopoverTrigger
					className="relative ml-1 hidden rounded-full sm:block"
					aria-label={chatMentions.length > 0 ? `User menu, ${toChatLabel(chatMentions)}` : "User menu"}
				>
					{/* the user avatar trigger button */}
					<UserAvatar
						userId={userId}
						username={username}
						avatarSource={avatarSource}
						className="size-9 border-2 border-white/55"
					/>
					{/* every unseen chat mention, summed, so the count is shown without opening the menu.
					    the rows inside split the same total between Profile and Teams */}
					{chatMentions.length > 0 && (
						<span className="absolute -top-1 -right-1">
							<ChatMentionCount
								chatMentions={chatMentions}
								className="bg-card text-card-foreground h-5 min-w-5 border text-xs"
							/>
						</span>
					)}
				</PopoverTrigger>
				<PopoverContent align="end" className="w-52 p-1">
					{/* the menu items for a signed-in user */}
					<UserMenuItems
						userId={userId}
						isAdmin={isAdmin}
						onNavigate={handleCloseMenu}
						onSignOut={handleConfirmSignOut}
					/>
				</PopoverContent>
			</Popover>
			<SignOutDialog open={isConfirmingSignOut} onOpenChange={setIsConfirmingSignOut} />
		</>
	)
}

/**
 * The user menu items, in the order they appear in both the wide-screen menu and the mobile dropdown
 */
export function UserMenuItems({
	userId,
	isAdmin,
	onNavigate,
	onSignOut,
}: {
	userId: string
	isAdmin: boolean
	onNavigate: () => void
	onSignOut: () => void
}) {
	// the current path is used to highlight the menu option
	const { pathname } = useLocation()
	// what the chat panel's poll last saw, so these rows count without this menu fetching anything
	const topicMentions = useAllTopicMentions()
	const teamMentions = useAllTeamMentions()
	return (
		<>
			<AnchorLink
				href={`/profiles/${userId}`}
				onClick={onNavigate}
				className={menuItemClassName(pathname, `/profiles/${userId}`)}
			>
				<CircleUserRound className="size-4" />
				<span className="flex-1">Profile</span>
				{/* everything waiting in a topic's chat, which the profile's topics table badges one by one */}
				{topicMentions.length > 0 && (
					<ChatMentionCount chatMentions={topicMentions} className="h-5 min-w-5 shrink-0 text-xs" />
				)}
			</AnchorLink>
			<AnchorLink href="/teams" onClick={onNavigate} className={menuItemClassName(pathname, "/teams")}>
				<Users className="size-4" />
				<span className="flex-1">Teams</span>
				{/* everything waiting in a team's own chat, which the teams index badges one by one */}
				{teamMentions.length > 0 && (
					<ChatMentionCount chatMentions={teamMentions} className="h-5 min-w-5 shrink-0 text-xs" />
				)}
			</AnchorLink>
			<AnchorLink href="/activity" onClick={onNavigate} className={menuItemClassName(pathname, "/activity")}>
				<Activity className="size-4" />
				Activity
			</AnchorLink>
			<AnchorLink href="/account" onClick={onNavigate} className={menuItemClassName(pathname, "/account")}>
				<User className="size-4" />
				Account
			</AnchorLink>
			{/* a divider under the rows about your own account, so what follows reads as the rest of the app */}
			<div className="bg-border my-1 h-px" />
			<AnchorLink href="/plans" onClick={onNavigate} className={menuItemClassName(pathname, "/plans")}>
				<Columns3Cog className="size-4" />
				Plans
			</AnchorLink>
			<DocsLink className={MENU_ITEM_CLASS} hasIcon onNavigate={onNavigate} />
			{/* a divider above the last group, the admin console and signing out */}
			<div className="bg-border my-1 h-px" />
			{isAdmin ? (
				<AnchorLink href="/admin" onClick={onNavigate} className={menuItemClassName(pathname, "/admin")}>
					<ShieldUser className="size-4" />
					Admin
				</AnchorLink>
			) : null}
			{/* sign-out always comes last with no highlight class */}
			<button type="button" onClick={onSignOut} className={MENU_ITEM_CLASS}>
				<LogOut className="size-4" />
				Sign out
			</button>
		</>
	)
}
