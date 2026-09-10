import { Activity, CircleUserRound, Columns3Cog, LogOut, ShieldUser, User, Users } from "lucide-react"
import { useState } from "react"
import { useLocation } from "react-router-dom"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { toUpdateLabel, UpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { DocsLink } from "@/components/layout/DocsLink"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { signOutAndReload } from "@/components/session/signOut"
import { MENU_OPTION_CLASS, MENU_OPTION_SELECTED_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { useAllChatMentions, useAllTeamChatMentions, useAllTopicChatMentions } from "@/stores/chatRoomStore"
import { useAllNoteBadges } from "@/stores/noteBadgeStore"
import { useTopicInviteBadges } from "@/stores/topicInviteStore"

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
	// the avatar's one badge sums every unread chat mention, note change, and topic invitation,
	// and the tooltip shows the waiting groups
	const chatMentions = useAllChatMentions()
	const noteBadges = useAllNoteBadges()
	const topicInviteBadges = useTopicInviteBadges()
	const menuLabel = ["User menu", toUpdateLabel(chatMentions, noteBadges, topicInviteBadges)].filter(Boolean).join(", ")

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
				{/* the one badge, its tooltip listing every waiting group under its own heading */}
				<UpdateCountBadge
					chatMentions={chatMentions}
					noteBadges={noteBadges}
					invites={topicInviteBadges}
					className="absolute -top-1 -right-1"
					countBadgeClassName="h-5 min-w-5 text-xs"
				/>
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
	// what the last poll read, split into the topics' and the teams' own. each row sums its own into one badge
	const topicChatMentions = useAllTopicChatMentions()
	const teamChatMentions = useAllTeamChatMentions()
	const noteBadges = useAllNoteBadges()
	const topicNoteBadges = noteBadges.filter((noteBadge) => noteBadge.topicId !== null)
	const teamNoteBadges = noteBadges.filter((noteBadge) => noteBadge.teamId !== null)
	const topicInviteBadges = useTopicInviteBadges()

	// the open page's row shows the selected tint
	const { pathname } = useLocation()
	const optionClassName = (href: string): string =>
		cn(MENU_OPTION_CLASS, pathname === href && MENU_OPTION_SELECTED_CLASS)
	const isCurrentRoute = (href: string): "page" | undefined => (pathname === href ? "page" : undefined)
	return (
		<>
			<AnchorLink
				href={`/profiles/${userId}`}
				onClick={onNavigate}
				aria-current={isCurrentRoute(`/profiles/${userId}`)}
				className={optionClassName(`/profiles/${userId}`)}
			>
				<CircleUserRound className="size-4" />
				<span className="flex-1">Profile</span>
				{/* the topics' unread chat mentions and note changes, in one count */}
				<UpdateCountBadge
					chatMentions={topicChatMentions}
					noteBadges={topicNoteBadges}
					className="shrink-0"
					countBadgeClassName="h-5 min-w-5 text-xs"
				/>
			</AnchorLink>
			<AnchorLink
				href="/teams"
				onClick={onNavigate}
				aria-current={isCurrentRoute("/teams")}
				className={optionClassName("/teams")}
			>
				<Users className="size-4" />
				<span className="flex-1">Teams</span>
				{/* the teams' own unread chat mentions and note changes, in one count */}
				<UpdateCountBadge
					chatMentions={teamChatMentions}
					noteBadges={teamNoteBadges}
					className="shrink-0"
					countBadgeClassName="h-5 min-w-5 text-xs"
				/>
			</AnchorLink>
			<AnchorLink
				href="/activity"
				onClick={onNavigate}
				aria-current={isCurrentRoute("/activity")}
				className={optionClassName("/activity")}
			>
				<Activity className="size-4" />
				<span className="flex-1">Activity</span>
				{/* the topic invitations waiting for an answer, each named in the tooltip */}
				<UpdateCountBadge invites={topicInviteBadges} className="shrink-0" countBadgeClassName="h-5 min-w-5 text-xs" />
			</AnchorLink>
			<AnchorLink
				href="/account"
				onClick={onNavigate}
				aria-current={isCurrentRoute("/account")}
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
				aria-current={isCurrentRoute("/plans")}
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
					aria-current={isCurrentRoute("/admin")}
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
