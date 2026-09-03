import { Activity, CircleUserRound, Columns3Cog, LogOut, ShieldUser, User, Users } from "lucide-react"
import { useState } from "react"
import { useLocation } from "react-router-dom"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { CountPill } from "@/components/common/CountPill"
import { DocsLink } from "@/components/layout/DocsLink"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { signOutAndReload } from "@/components/session/signOut"
import { ChatMentionCount, toChatLabel, toNoteLabel } from "@/components/topic/TopicMentionBadge"
import { MENU_OPTION_CLASS, MENU_OPTION_SELECTED_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { useAllChatMentions, useAllTeamMentions, useAllTopicMentions } from "@/stores/chatRoomStore"
import { useAllNoteCount, useAllTeamNoteCount, useAllTopicNoteCount } from "@/stores/noteBadgeStore"

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
	// the avatar's badges. every unread chat mention across every chat, and every unread note change
	const chatMentions = useAllChatMentions()
	const noteCount = useAllNoteCount()

	// the trigger names whichever badges it is showing
	const badgeLabels = [chatMentions.length > 0 && toChatLabel(chatMentions), noteCount > 0 && toNoteLabel(noteCount)]
	const menuLabel = ["User menu", ...badgeLabels.filter(Boolean)].join(", ")

	// controlled so the menu closes on item click and navigation
	const [isOpen, setIsOpen] = useState(false)
	const handleCloseMenu = (): void => {
		setIsOpen(false)
	}

	// signing out is reversible and loses nothing, so one click does it
	const handleSignOut = (): void => {
		handleCloseMenu()
		void signOutAndReload()
	}

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger className="relative ml-1 hidden rounded-full sm:block" aria-label={menuLabel}>
				{/* the user avatar trigger button */}
				<UserAvatar
					userId={userId}
					username={username}
					avatarSource={avatarSource}
					className="size-9 border-2 border-white/55"
				/>
				{/* the filled chat mention badge leads the pair, and the outline note badge follows it */}
				{(noteCount > 0 || chatMentions.length > 0) && (
					<span className="absolute -top-1 -right-1 flex items-center gap-1">
						{chatMentions.length > 0 && (
							<ChatMentionCount
								chatMentions={chatMentions}
								className="bg-card text-card-foreground h-5 min-w-5 border text-xs"
							/>
						)}
						{noteCount > 0 && <CountPill count={noteCount} variant="outline" className="h-5 min-w-5 text-xs" />}
					</span>
				)}
			</PopoverTrigger>
			<PopoverContent align="end" className="w-52" bodyClassName="p-1">
				{/* the menu items for a signed-in user */}
				<UserMenuItems userId={userId} isAdmin={isAdmin} onNavigate={handleCloseMenu} onSignOut={handleSignOut} />
			</PopoverContent>
		</Popover>
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
	// chat mention counts from the chat panel's last poll
	const topicMentions = useAllTopicMentions()
	const teamMentions = useAllTeamMentions()

	// the unread note counts, the topics' notes and the teams' own
	const topicNoteCount = useAllTopicNoteCount()
	const teamNoteCount = useAllTeamNoteCount()

	// the open page's row shows the selected tint
	const { pathname } = useLocation()
	const optionClassName = (href: string): string =>
		cn(MENU_OPTION_CLASS, pathname === href && MENU_OPTION_SELECTED_CLASS)
	const isCurrent = (href: string): "page" | undefined => (pathname === href ? "page" : undefined)
	return (
		<>
			<AnchorLink
				href={`/profiles/${userId}`}
				onClick={onNavigate}
				aria-current={isCurrent(`/profiles/${userId}`)}
				className={optionClassName(`/profiles/${userId}`)}
			>
				<CircleUserRound className="size-4" />
				<span className="flex-1">Profile</span>
				{/* every unread chat mention in the topics' chats, then the unread notes on those topics, both summed */}
				{topicMentions.length > 0 && (
					<ChatMentionCount chatMentions={topicMentions} className="h-5 min-w-5 shrink-0 text-xs" />
				)}
				{topicNoteCount > 0 && (
					<CountPill count={topicNoteCount} variant="outline" className="h-5 min-w-5 shrink-0 text-xs" />
				)}
			</AnchorLink>
			<AnchorLink
				href="/teams"
				onClick={onNavigate}
				aria-current={isCurrent("/teams")}
				className={optionClassName("/teams")}
			>
				<Users className="size-4" />
				<span className="flex-1">Teams</span>
				{/* every unread chat mention in the teams' own chats, then the unread notes on those teams, both summed */}
				{teamMentions.length > 0 && (
					<ChatMentionCount chatMentions={teamMentions} className="h-5 min-w-5 shrink-0 text-xs" />
				)}
				{teamNoteCount > 0 && (
					<CountPill count={teamNoteCount} variant="outline" className="h-5 min-w-5 shrink-0 text-xs" />
				)}
			</AnchorLink>
			<AnchorLink
				href="/activity"
				onClick={onNavigate}
				aria-current={isCurrent("/activity")}
				className={optionClassName("/activity")}
			>
				<Activity className="size-4" />
				Activity
			</AnchorLink>
			<AnchorLink
				href="/account"
				onClick={onNavigate}
				aria-current={isCurrent("/account")}
				className={optionClassName("/account")}
			>
				<User className="size-4" />
				Account
			</AnchorLink>
			{/* a divider under the account rows */}
			<div className="bg-border my-1 h-px" />
			<AnchorLink
				href="/plans"
				onClick={onNavigate}
				aria-current={isCurrent("/plans")}
				className={optionClassName("/plans")}
			>
				<Columns3Cog className="size-4" />
				Plans
			</AnchorLink>
			{/* the docs open in their own tab */}
			<DocsLink className={MENU_OPTION_CLASS} hasIcon onNavigate={onNavigate} />
			{/* a divider above the last group, the admin console and signing out */}
			<div className="bg-border my-1 h-px" />
			{isAdmin ? (
				<AnchorLink
					href="/admin"
					onClick={onNavigate}
					aria-current={isCurrent("/admin")}
					className={optionClassName("/admin")}
				>
					<ShieldUser className="size-4" />
					Admin
				</AnchorLink>
			) : null}
			<button type="button" onClick={onSignOut} className={MENU_OPTION_CLASS}>
				<LogOut className="size-4" />
				Sign out
			</button>
		</>
	)
}
