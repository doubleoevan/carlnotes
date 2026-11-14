import { authClient } from "@carlnotes/client/authClient"
import { toSessionAvatarVersion } from "@carlnotes/contracts/avatars"
import { isAdminRole } from "@carlnotes/contracts/enums"
import { cn } from "@carlnotes/nightshift/classNames"
import { useLocation } from "@tanstack/react-router"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { BrandLink } from "@/components/common/BrandLink"
import { buttonVariants } from "@/components/primitives/button"
import {
	TopicTutorialVideoButton,
	TopicTutorialVideoDialog,
	type TopicTutorialVideoOpener,
} from "@/components/topic/TopicTutorialVideoDialog"
import { useIsSignedInBeforeSession } from "@/hooks/useIsSignedInBeforeSession"
import { useTheme } from "@/hooks/useTheme"
import { HERO_BUTTON_HOVER_CLASS, LOGO_CLASS, NARROW_SCREEN_HIDDEN_CLASS } from "@/lib/styleClasses"
import { toLinkClickHandler, toSafeRedirectPath } from "@/lib/utils"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { clearSearchBar, useSearchBarPath } from "@/stores/searchBarStore"
import { HeaderMenu } from "./HeaderMenu"
import { HomeHero } from "./HomeHero"
import { ThemeToggle } from "./ThemeToggle"
import { UserMenu } from "./UserMenu"

// the desktop nav link's classes on the dark hero band. the current page is marked with a white wash at twice the hover fill
function menuLinkClassName(pathname: string, href: string): string {
	return cn(
		buttonVariants({ variant: "ghost" }),
		"min-h-9",
		HERO_BUTTON_HOVER_CLASS,
		pathname === href && "bg-white/20",
	)
}

/**
 * The global header that renders on every page
 */
export function Header() {
	const { isDark, toggleTheme } = useTheme()
	// drives the menu items in both the desktop menu and the mobile menu
	const { data: session } = authClient().useSession()
	const isSignedIn = Boolean(session)
	// the admin link renders only for admins
	const isAdmin = isAdminRole(session?.user.role)
	// the headline shimmers on every route change. keying the wrapper by pathname remounts it to replay
	const pathname = useLocation({ select: (location) => location.pathname })
	// a click on a home link while already on the home page reloads the feed
	const { reheat } = useTopicFeed()
	const handleHomeClick = pathname === "/" ? toLinkClickHandler(() => void reheat()) : undefined
	const logoLink = useLogoLink(pathname, handleHomeClick)

	// the hero pitches the app to a visitor. it only shows on the home page to visitors
	const isSignedInBeforeSession = useIsSignedInBeforeSession()
	const isHeroShown = !isSignedInBeforeSession && pathname === "/"
	// the video on making a topic, which the header's button and either menu open in one dialog, and where it was opened from
	const [topicTutorialVideoOpener, setTopicTutorialVideoOpener] = useState<TopicTutorialVideoOpener | null>(null)
	return (
		<header className="bg-hero text-hero-foreground relative overflow-hidden">
			<div className={cn("relative z-10 mx-auto max-w-5xl px-safe pt-5", !isHeroShown && "pb-10")}>
				{/* the top bar with the brand icon on the left and the menu on the right. without JavaScript a narrow screen
				    wraps the menu items onto a second row */}
				<div className="flex flex-wrap items-center justify-between gap-y-2">
					{/* the brand, with the video's button after it, nudged down to the logo's letters */}
					<div className="flex items-center gap-2">
						{/* the brand links to the search bar's search, or home, emptying the bar from the search page and reheating
						    the feed if already home */}
						<BrandLink
							href={logoLink.href}
							aria-label={logoLink.ariaLabel}
							onClick={logoLink.onClick}
							// nudge the mug up to align with the text
							mugClassName="text-hero-accent -translate-y-0.5"
							nameClassName={cn("animate-hydrate", LOGO_CLASS)}
						/>
						<TopicTutorialVideoButton
							onSelect={() => setTopicTutorialVideoOpener("header")}
							className="size-7 -translate-y-px"
						/>
					</div>
					{/* the desktop menu items, swapped for the hamburger menu on small screens with JavaScript. the hamburger
					    menu opens by script, so a browser without JavaScript keeps the items at every width */}
					<div className={cn("flex flex-wrap items-center gap-1", NARROW_SCREEN_HIDDEN_CLASS)}>
						<ThemeToggle isDark={isDark} onToggle={toggleTheme} />
						{/* topics and plans move into the user menu once signed in */}
						{!session && (
							<>
								<AnchorLink
									href="/topics"
									aria-current={pathname === "/topics" ? "page" : undefined}
									className={menuLinkClassName(pathname, "/topics")}
								>
									Topics
								</AnchorLink>
								<AnchorLink
									href="/plans"
									aria-current={pathname === "/plans" ? "page" : undefined}
									className={menuLinkClassName(pathname, "/plans")}
								>
									Plans
								</AnchorLink>
							</>
						)}
						{session ? (
							// the user items live in the avatar dropdown
							<UserMenu
								userId={session.user.id}
								username={session.user.username}
								avatarVersion={toSessionAvatarVersion(session.user)}
								isAdmin={isAdmin}
								onPlayTopicTutorialVideo={setTopicTutorialVideoOpener}
							/>
						) : (
							<>
								{/* the sign-in link, which crawlers do not follow */}
								<AnchorLink
									href={`/login?next=${encodeURIComponent(toSafeRedirectPath(pathname))}`}
									rel="nofollow"
									className={cn(buttonVariants({ variant: "ghost" }), "min-h-9", HERO_BUTTON_HOVER_CLASS)}
								>
									Log in
								</AnchorLink>
								{/* use the "default" variant's primary color as a call to action. cta names the button for analytics */}
								<AnchorLink
									href="/signup?cta=header"
									rel="nofollow"
									className={cn(buttonVariants({ variant: "default" }), "min-h-9")}
								>
									Sign up
								</AnchorLink>
							</>
						)}
					</div>
					<HeaderMenu
						isDark={isDark}
						onToggleTheme={toggleTheme}
						isSignedIn={isSignedIn}
						isAdmin={isAdmin}
						userId={session?.user.id ?? ""}
						onPlayTopicTutorialVideo={setTopicTutorialVideoOpener}
					/>
				</div>
				{/* the hero pitches the app to a visitor */}
				{isHeroShown && <HomeHero onHomeClick={handleHomeClick} />}
			</div>
			{/* the dialog that plays the video on making a topic, opened from the header or either menu */}
			{topicTutorialVideoOpener && (
				<TopicTutorialVideoDialog opener={topicTutorialVideoOpener} onClose={() => setTopicTutorialVideoOpener(null)} />
			)}
		</header>
	)
}

// what a click on the logo runs as it follows the link
type LogoClickHandler = ReturnType<typeof toLinkClickHandler>

// where the logo links: the search bar's search from any other page while the bar holds text, and home otherwise,
// emptying the bar from the search page and reheating the feed if already home
function useLogoLink(
	pathname: string,
	handleHomeClick: LogoClickHandler | undefined,
): { href: string; ariaLabel: string; onClick: LogoClickHandler | undefined } {
	const searchBarPath = useSearchBarPath()
	if (pathname === "/search") {
		return { href: "/", ariaLabel: "CarlNotes home", onClick: clearSearchBar }
	}
	return searchBarPath
		? { href: searchBarPath, ariaLabel: "CarlNotes search", onClick: undefined }
		: { href: "/", ariaLabel: "CarlNotes home", onClick: handleHomeClick }
}
