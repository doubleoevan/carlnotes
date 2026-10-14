import { toAvatarVersion } from "@shared/avatars"
import { useLocation } from "@tanstack/react-router"
import { useState } from "react"
import { authClient } from "@/clients/authClient"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { CoffeeRings } from "@/components/branding/CoffeeRings"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Attribution } from "@/components/layout/Attribution"
import { DocsLink } from "@/components/layout/DocsLink"
import { HeaderMenu } from "@/components/layout/HeaderMenu"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { UserMenu } from "@/components/layout/UserMenu"
import { buttonVariants } from "@/components/primitives/button"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import {
	TopicTutorialVideoButton,
	TopicTutorialVideoDialog,
	type TopicTutorialVideoOpener,
} from "@/components/topic/TopicTutorialVideoDialog"
import { useIsSignedInBeforeSession } from "@/hooks/useIsSignedInBeforeSession"
import { useTheme } from "@/hooks/useTheme"
import { cn, toLinkClickHandler, toSafeRedirectPath } from "@/lib/utils"
import { useTopicFeed } from "@/providers/TopicFeedProvider"

// the hover style shared by the header's menu buttons
const HERO_BUTTON_HOVER = "hover:bg-white/10 hover:text-hero-foreground dark:hover:bg-white/10"

// Carl's pitch, shown inline on wide screens and inside the phone's note popover
const CARL_PITCH =
	"Carl doesn't check the news. The news checks in with Carl. Carl never sleeps. He drinks coffee and reads everything. He finished the internet. Now he checks nightly for new stuff. And when you drop by, he has notes and a podcast."

// the desktop nav link's classes on the dark hero band. the current page is marked with a white wash at twice the hover fill
function menuLinkClassName(pathname: string, href: string): string {
	return cn(buttonVariants({ variant: "ghost" }), "min-h-9", HERO_BUTTON_HOVER, pathname === href && "bg-white/20")
}

/**
 * The global header that renders on every page
 */
export function Header() {
	const { isDark, toggleTheme } = useTheme()
	// drives the menu items in both the desktop menu and the mobile menu
	const { data: session } = authClient.useSession()
	const isSignedIn = Boolean(session)
	// the admin link renders only for admins
	const isAdmin = session?.user.role === "admin"
	// the headline shimmers on every route change. keying the wrapper by pathname remounts it to replay
	const pathname = useLocation({ select: (location) => location.pathname })
	// a click on a home link while already on the home page reloads the feed
	const { reheat } = useTopicFeed()
	const handleHomeClick = pathname === "/" ? toLinkClickHandler(() => void reheat()) : undefined

	// the hero pitches the app to a visitor. it only shows on the home page to logged-out visitors.
	// a signed-in user gets the video's button beside the wordmark instead
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
					{/* the brand, with the video's button after it for a signed-in user, nudged down to the wordmark's letters */}
					<div className="flex items-center gap-2">
						{/* the brand links home or reheats the feed if already on the home page */}
						<AnchorLink
							href="/"
							aria-label="CarlNotes home"
							onClick={handleHomeClick}
							className="flex items-center gap-2 rounded-md"
						>
							{/* nudge the cup up to align with the text */}
							<CoffeeMug className="text-hero-accent -translate-y-0.5" />
							<span className="animate-hydrate font-display text-xl">CarlNotes</span>
						</AnchorLink>
						{isSignedInBeforeSession && (
							<TopicTutorialVideoButton
								onSelect={() => setTopicTutorialVideoOpener("header")}
								className="size-7 translate-y-0.5"
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
								<DocsLink className={cn(buttonVariants({ variant: "ghost" }), "min-h-9", HERO_BUTTON_HOVER)} />
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
									className={cn(buttonVariants({ variant: "ghost" }), "min-h-9", HERO_BUTTON_HOVER)}
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
				{/* the hero: the headline shimmers and the copy fades in.
				    on a narrow screen, the headline spans both columns above Carl. on a wide screen, Carl takes the left and the headline goes right */}
				{isHeroShown && (
					<div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-4">
						{/* the headline with the video's button after it, centered on a narrow screen, left-aligned on a wide one.
						    "All of it." stays on one line in every copy, so a narrow screen breaks the headline before it,
						    and the button sits beside that last line */}
						<div className="col-span-2 flex items-end justify-center gap-2 sm:col-span-1 sm:col-start-2 sm:items-center sm:justify-start sm:gap-3">
							{/* the hero headline: a light wipes across the dimmed text, revealing it in full color.
						        keyed to the pathname to replay per route. the overlay copies stay letter-aligned */}
							<div key={pathname} className="shimmer-reveal min-w-0 text-center sm:text-left">
								{/* the dimmed heading that the light reveals. the page's real h1. only this copy is a link.
							        the overlay copies are pointer-transparent */}
								<h1 className="shimmer-reveal-base font-display text-2xl leading-tight sm:text-4xl">
									{`He already read it. `}
									<AnchorLink href="/" onClick={handleHomeClick} className="text-hero-accent whitespace-nowrap">
										All of it.
									</AnchorLink>
								</h1>
								{/* the full-color copy the light wipes in from the left */}
								<div aria-hidden="true" className="shimmer-reveal-top font-display text-2xl leading-tight sm:text-4xl">
									He already read it. <span className="text-hero-accent whitespace-nowrap">All of it.</span>
								</div>
								{/* a white highlight on the reveal edge */}
								<div
									aria-hidden="true"
									className="shimmer-reveal-glint font-display text-2xl leading-tight sm:text-4xl"
								>
									He already read it. <span className="whitespace-nowrap">All of it.</span>
								</div>
							</div>
							<TopicTutorialVideoButton
								onSelect={() => setTopicTutorialVideoOpener("hero")}
								className="size-8 sm:size-11"
							/>
						</div>
						{/* Carl links home. the image is pulled down so his lower half starts behind the search bar */}
						<AnchorLink
							href="/"
							onClick={handleHomeClick}
							aria-label="CarlNotes home"
							className="row-start-2 shrink-0 sm:row-span-2 sm:row-start-1 sm:ml-4"
						>
							<img
								src="/carl-hero.png"
								width={472}
								height={535}
								alt="Carl, holding a raccoon and a machine learning textbook"
								className="w-28 pb-6 -mb-4 sm:w-52"
							/>
						</AnchorLink>
						{/* the copy clears the search bar overlapping the hero's bottom edge */}
						<div className="col-start-2 row-start-2 min-w-0 pb-10">
							{/* Carl's pitch, then the call to action and the tagline.
						    the pitch on a narrow screen is hidden and shows up in a popup */}
							<div className="animate-hydrate mt-3 text-sm" style={{ animationDelay: "80ms" }}>
								<p className="hidden max-w-xl sm:block">
									{CARL_PITCH}
									<AttributionButton />
								</p>
								<p className="mt-3 font-bold">
									{"Give Carl three topics. You know the ones. He'll brew a hot cup of what you just missed."}
									<PitchButton />
								</p>
								<p className="text-hero-accent mt-1 font-bold">
									<AnchorLink href="/" onClick={handleHomeClick} className="hover:underline">
										Carl stays up. You stay informed.
									</AnchorLink>
								</p>
							</div>
						</div>
					</div>
				)}
			</div>
			{/* the dialog that plays the video on making a topic, opened from the hero or either menu */}
			{topicTutorialVideoOpener && (
				<TopicTutorialVideoDialog opener={topicTutorialVideoOpener} onClose={() => setTopicTutorialVideoOpener(null)} />
			)}
		</header>
	)
}

// the narrow screen note button after the call to action
function PitchButton() {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						className="hover:opacity-75 ml-1 inline-grid size-5 translate-y-0.5 place-items-center align-text-bottom sm:hidden"
						aria-label="Meet Carl"
					>
						{/* the tile fills this inline box exactly */}
						<NoteIcon className="size-5 rounded-sm" />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>A note from Carl</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className="w-72 text-sm font-normal">
				<PopoverCloseButton />
				{/* the title label. the first line clears the close button */}
				<div className="text-muted-foreground font-display mb-2 text-center text-xs tracking-wide uppercase">
					Meet Carl
				</div>
				<p>{CARL_PITCH}</p>
			</PopoverContent>
		</Popover>
	)
}

// the note button tucked after the pitch. it opens the persona credit in a popover with a close ✕
function AttributionButton() {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						className="hover:opacity-75 ml-1 inline-grid size-5 translate-y-0.5 place-items-center align-text-bottom"
						aria-label="About the CarlNotes persona"
					>
						{/* the tile fills this inline box exactly */}
						<NoteIcon className="size-5 rounded-sm" />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>A note from Carl</TooltipContent>
			</Tooltip>
			<PopoverContent align="start" className="w-80 text-sm">
				<PopoverCloseButton />
				{/* the persona credit's label. the first line clears the close button */}
				<div className="text-muted-foreground font-display mb-1 text-center text-xs tracking-wide uppercase">
					The Real Carl
				</div>
				<Attribution />
			</PopoverContent>
		</Popover>
	)
}
