import { authClient } from "@carlnotes/client/authClient"
import { toAvatarVersion } from "@carlnotes/contracts/avatars"
import { isAdminRole } from "@carlnotes/contracts/enums"
import { cn } from "@carlnotes/nightshift/classNames"
import { useLocation } from "@tanstack/react-router"
import { useState } from "react"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { CoffeeRings } from "@/components/branding/CoffeeRings"
import { AnchorLink } from "@/components/common/AnchorLink"
import { buttonVariants } from "@/components/primitives/button"
import {
	TopicTutorialVideoButton,
	TopicTutorialVideoDialog,
	type TopicTutorialVideoOpener,
} from "@/components/topic/TopicTutorialVideoDialog"
import { useIsSignedInBeforeSession } from "@/hooks/useIsSignedInBeforeSession"
import { useTheme } from "@/hooks/useTheme"
import { HERO_BUTTON_HOVER_CLASS, LOGO_CLASS } from "@/lib/styleClasses"
import { toLinkClickHandler, toSafeRedirectPath } from "@/lib/utils"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { clearSearchBar, useSearchBarPath } from "@/stores/searchBarStore"
import { DocsLink } from "./DocsLink"
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

	// the hero pitches the app to a visitor. it only shows on the home page to logged-out visitors.
	// a page without the hero gets the video's button beside the logo instead
	const isSignedInBeforeSession = useIsSignedInBeforeSession()
	const isHeroShown = !isSignedInBeforeSession && pathname === "/"
	// the video on making a topic, which the hero and either menu open in one dialog, and where it was opened from
	const [topicTutorialVideoOpener, setTopicTutorialVideoOpener] = useState<TopicTutorialVideoOpener | null>(null)
	return (
		<header className="bg-hero text-hero-foreground relative overflow-hidden">
			{isHeroShown && <CoffeeRings />}
			<div className={cn("relative z-10 mx-auto max-w-5xl px-safe pt-5", !isHeroShown && "pb-10")}>
				{/* the top bar with the brand icon on the left and the menu on the right */}
				<div className="flex items-center justify-between">
					{/* the brand, with the video's button after it if the hero is hidden, nudged down to the logo's letters */}
					<div className="flex items-center gap-2">
						{/* the brand links to the search bar's search, or home, emptying the bar from the search page and reheating
						    the feed if already home */}
						<AnchorLink
							href={logoLink.href}
							aria-label={logoLink.ariaLabel}
							onClick={logoLink.onClick}
							className="flex items-center gap-2 rounded-md"
						>
							{/* nudge the cup up to align with the text */}
							<CoffeeMug className="text-hero-accent -translate-y-0.5" />
							<span className={cn("animate-hydrate", LOGO_CLASS)}>CarlNotes</span>
						</AnchorLink>
						{!isHeroShown && (
							<TopicTutorialVideoButton
								onSelect={() => setTopicTutorialVideoOpener("header")}
								className="size-7 -translate-y-px"
							/>
						)}
					</div>
					{/* the desktop menu items, swapped for the hamburger menu on small screens */}
					<div className="hidden items-center gap-1 sm:flex">
						<ThemeToggle isDark={isDark} onToggle={toggleTheme} />
						{/* docs and plans move into the user menu once signed in */}
						{!session && (
							<>
								{/* the docs open in their own tab */}
								<DocsLink className={cn(buttonVariants({ variant: "ghost" }), "min-h-9", HERO_BUTTON_HOVER_CLASS)} />
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
								avatarVersion={toAvatarVersion(session.user)}
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
				{isHeroShown && (
					<HomeHero
						pathname={pathname}
						onHomeClick={handleHomeClick}
						onPlayTopicTutorialVideo={() => setTopicTutorialVideoOpener("hero")}
					/>
				)}
			</div>
			{/* the dialog that plays the video on making a topic, opened from the hero or either menu */}
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
