import { UserMenuItems as SharedUserMenuItems, type UserMenuElements } from "@carlnotes/core/components/UserMenuItems"
import { useAllTeamChatMentions, useAllTopicChatMentions } from "@carlnotes/core/stores/chatRoomStore"
import { useAllNoteBadges } from "@carlnotes/core/stores/noteBadgeStore"
import { useTopicInviteBadges } from "@carlnotes/core/stores/topicInviteStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { useLocation } from "@tanstack/react-router"
import { Activity, BookOpen, CircleUserRound, Columns3Cog, LogOut, ShieldUser, User, Users } from "lucide-react"
import { useState } from "react"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { MenuTriggerUpdateCountBadge, UpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { signOutAndReload } from "@/components/session/signOut"
import { type TopicTutorialVideoOpener, TopicTutorialVideoOption } from "@/components/topic/TopicTutorialVideoDialog"
import { MENU_DIVIDER_CLASS, MENU_OPTION_CLASS, MENU_OPTION_SELECTED_CLASS } from "@/lib/styleClasses"

/**
 * The wide-screen user menu is a dropdown opened from the signed-in user's avatar.
 */
export function UserMenu({
	userId,
	username,
	avatarVersion,
	isAdmin,
	onPlayTopicTutorialVideo,
}: {
	userId: string
	username: string
	avatarVersion: string | null
	isAdmin: boolean
	onPlayTopicTutorialVideo: (opener: TopicTutorialVideoOpener) => void
}) {
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
			<PopoverTrigger className="relative ml-1 hidden rounded-full sm:block">
				{/* the trigger's name and the one badge, its tooltip listing every waiting group under its own heading */}
				<MenuTriggerUpdateCountBadge
					name="User menu"
					className="absolute -top-1 -right-1"
					countBadgeClassName="h-5 min-w-5 text-xs"
				/>
				{/* the user avatar trigger button */}
				<UserAvatar
					userId={userId}
					username={username}
					avatarVersion={avatarVersion}
					className="size-9 border-2 border-white/55"
				/>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-52" bodyClassName="p-1">
				{/* the menu items for a signed-in user */}
				<UserMenuItems
					userId={userId}
					isAdmin={isAdmin}
					onNavigate={handleCloseMenu}
					onPlayTopicTutorialVideo={() => onPlayTopicTutorialVideo("account-menu")}
					onSignOut={handleSignOut}
				/>
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
	onPlayTopicTutorialVideo,
	onSignOut,
}: {
	userId: string
	isAdmin: boolean
	onNavigate: () => void
	onPlayTopicTutorialVideo: () => void
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
	const pathname = useLocation({ select: (location) => location.pathname })
	return (
		<SharedUserMenuItems
			elements={USER_MENU_ELEMENTS}
			userId={userId}
			isAdmin={isAdmin}
			pathname={pathname}
			onNavigate={onNavigate}
			onPlayTutorial={onPlayTopicTutorialVideo}
			onSignOut={onSignOut}
			renderBadge={(label) =>
				label === "Activity" ? (
					<UpdateCountBadge
						invites={topicInviteBadges}
						className="shrink-0"
						countBadgeClassName="h-5 min-w-5 text-xs"
					/>
				) : (
					<UpdateCountBadge
						chatMentions={label === "Profile" ? topicChatMentions : teamChatMentions}
						noteBadges={label === "Profile" ? topicNoteBadges : teamNoteBadges}
						className="shrink-0"
						countBadgeClassName="h-5 min-w-5 text-xs"
					/>
				)
			}
		/>
	)
}

// keep DOM navigation, badges, and tutorial rendering in stable platform adapters
const MENU_ICONS = {
	Profile: CircleUserRound,
	Teams: Users,
	Activity,
	Account: User,
	Plans: Columns3Cog,
	"What CarlNotes Is": BookOpen,
	Admin: ShieldUser,
}
const USER_MENU_ELEMENTS: UserMenuElements = {
	Link: ({ label, href, isSelected, onSelect, children }) => {
		const Icon = MENU_ICONS[label as keyof typeof MENU_ICONS]
		return (
			<AnchorLink
				href={href}
				isNewTab={href === "/docs"}
				onClick={onSelect}
				aria-current={isSelected ? "page" : undefined}
				className={cn(MENU_OPTION_CLASS, isSelected && MENU_OPTION_SELECTED_CLASS)}
			>
				<Icon className="size-4" />
				<span className="flex-1">{label}</span>
				{children}
			</AnchorLink>
		)
	},
	Action: ({ label, onSelect, isDisabled }) =>
		label === "Brew with Carl" ? (
			<TopicTutorialVideoOption onSelect={onSelect} />
		) : (
			<button type="button" onClick={onSelect} disabled={isDisabled} className={MENU_OPTION_CLASS}>
				<LogOut className="size-4" />
				{label}
			</button>
		),
	Divider: () => <div className={MENU_DIVIDER_CLASS} />,
}
