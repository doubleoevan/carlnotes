// the header's mobile-only hamburger menu

import { useLocation } from "@tanstack/react-router"
import { Columns3Cog, LogIn, Menu, Moon, Sun, UserPlus } from "lucide-react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { MenuTriggerUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { signOutAndReload } from "@/components/session/signOut"
import { type TopicTutorialVideoOpener, TopicTutorialVideoOption } from "@/components/topic/TopicTutorialVideoDialog"
import { MENU_DIVIDER_CLASS, MENU_OPTION_CLASS, MENU_OPTION_SELECTED_CLASS } from "@/lib/styleClasses"
import { cn, toSafeRedirectPath } from "@/lib/utils"
import { DocsLink } from "./DocsLink"
import { UserMenuItems } from "./UserMenu"

// the size the count pills shrink to in the hamburger menu's corner
const MENU_BADGE_CLASS = "h-4 min-w-4 text-[0.625rem]"

/**
 * The mobile-only hamburger menu: the theme toggle, then the video, the docs, plans, and sign-in for a visitor, or the
 * user menu items for a signed-in user.
 */
export function HeaderMenu({
	isDark,
	onToggleTheme,
	isSignedIn,
	isAdmin,
	userId,
	onPlayTopicTutorialVideo,
}: {
	isDark: boolean
	onToggleTheme: () => void
	isSignedIn: boolean
	isAdmin: boolean
	userId: string
	onPlayTopicTutorialVideo: (opener: TopicTutorialVideoOpener) => void
}) {
	// the path highlights the open page's option, and sends the login back to where the visitor started
	const pathname = useLocation({ select: (location) => location.pathname })
	// controlled so every item click closes the menu, including navigation and sign-out
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const closeMenu = (): void => {
		setIsMenuOpen(false)
	}

	// sign out and refresh the page
	const handleSignOut = (): void => {
		closeMenu()
		void signOutAndReload()
	}

	// close the menu and play the video on making a topic in its dialog
	const handlePlayTopicTutorialVideo = (): void => {
		closeMenu()
		onPlayTopicTutorialVideo("mobile-menu")
	}

	return (
		<Popover open={isMenuOpen} onOpenChange={setIsMenuOpen}>
			<PopoverTrigger className="relative grid size-11 place-items-center rounded-md hover:bg-white/10 sm:hidden">
				{/* the trigger's name and the one unread count badged on the menu trigger */}
				<MenuTriggerUpdateCountBadge
					name="Menu"
					className="absolute top-1 right-1"
					countBadgeClassName={MENU_BADGE_CLASS}
				/>
				<Menu className="size-5" />
			</PopoverTrigger>
			<PopoverContent align="end" className="w-52" bodyClassName="p-1">
				<button
					type="button"
					onClick={() => {
						onToggleTheme()
						closeMenu()
					}}
					className={MENU_OPTION_CLASS}
				>
					{isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
					{isDark ? "Light mode" : "Dark mode"}
				</button>
				{/* docs and plans move into the user menu once signed in */}
				{!isSignedIn && (
					<>
						{/* the video on making a topic, which plays in a dialog */}
						<TopicTutorialVideoOption onSelect={handlePlayTopicTutorialVideo} />
						{/* the docs open in their own tab */}
						<DocsLink className={MENU_OPTION_CLASS} hasIcon onNavigate={closeMenu} />
						<AnchorLink
							href="/plans"
							onClick={closeMenu}
							aria-current={pathname === "/plans" ? "page" : undefined}
							className={cn(MENU_OPTION_CLASS, pathname === "/plans" && MENU_OPTION_SELECTED_CLASS)}
						>
							<Columns3Cog className="size-4" />
							Plans
						</AnchorLink>
					</>
				)}
				{isSignedIn ? (
					// the user menu items form the block below a horizontal divider
					<>
						<div className={MENU_DIVIDER_CLASS} />
						<UserMenuItems
							userId={userId}
							isAdmin={isAdmin}
							onNavigate={closeMenu}
							onPlayTopicTutorialVideo={() => onPlayTopicTutorialVideo("mobile-menu")}
							onSignOut={handleSignOut}
						/>
					</>
				) : (
					<>
						{/* the sign-in link, which crawlers do not follow */}
						<AnchorLink
							href={`/login?next=${encodeURIComponent(toSafeRedirectPath(pathname))}`}
							rel="nofollow"
							onClick={closeMenu}
							className={MENU_OPTION_CLASS}
						>
							<LogIn className="size-4" />
							Log in
						</AnchorLink>
						{/* use the primary color as a call to action. cta names the button for analytics */}
						<AnchorLink
							href="/signup?cta=menu"
							rel="nofollow"
							onClick={closeMenu}
							className={cn(MENU_OPTION_CLASS, "bg-primary text-primary-foreground hover:bg-primary/90")}
						>
							<UserPlus className="size-4" />
							Sign up
						</AnchorLink>
					</>
				)}
			</PopoverContent>
		</Popover>
	)
}
