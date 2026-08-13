import { Columns3Cog, LogIn, Menu, Moon, Sun, UserPlus } from "lucide-react"
import { useState } from "react"
import { useLocation } from "react-router-dom"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { CoffeeRings } from "@/components/branding/CoffeeRings"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Attribution } from "@/components/layout/Attribution"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { MENU_ITEM_CLASS, menuItemClassName, UserMenu, UserMenuItems } from "@/components/layout/UserMenu"
import { buttonVariants } from "@/components/primitives/button"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { SignOutDialog } from "@/components/session/SignOutDialog"
import { useTheme } from "@/hooks/useTheme"
import { authClient } from "@/lib/authClient"
import { cn, toSafeRedirectPath } from "@/lib/utils"
import { useTopicFeed } from "@/providers/TopicFeedProvider"

// the hover treatment shared by the header's menu buttons, tuned for the dark hero banner
const HERO_BUTTON_HOVER = "hover:bg-white/10 hover:text-hero-foreground dark:hover:bg-white/10"

// Carl's pitch, shown inline on wide screens and inside the phone's note popover
const CARL_PITCH =
	"Carl doesn't check the news. The news checks in with Carl. Carl never sleeps. He drinks coffee and reads everything. He finished the internet. Now he checks nightly for new stuff. And when you drop by, he has notes."

// the desktop nav link's classes: the current page gets the same background tint as hover, so it reads as selected
function menuLinkClassName(pathname: string, href: string): string {
	return cn(buttonVariants({ variant: "ghost" }), "min-h-9", HERO_BUTTON_HOVER, pathname === href && "bg-white/10")
}

/**
 * The global header that renders on every page
 */
export function Header() {
	const { isDark, toggleTheme } = useTheme()
	// drives the menu items in both the desktop menu and the mobile menu
	const { data: session } = authClient.useSession()
	const isSignedIn = Boolean(session)
	// the admin link renders only for admins. the api re-checks the role on every admin call
	const isAdmin = session?.user.role === "admin"
	// the headline shimmers on every route change: keying the wrapper by pathname remounts it to replay
	const { pathname } = useLocation()
	// a click on a link that is already home reloads the feed instead of navigating.
	// a click from a link on another page navigates home
	const { reheat } = useTopicFeed()
	function handleHomeClick(event: React.MouseEvent): void {
		if (pathname !== "/" || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
			return
		}
		event.preventDefault()
		void reheat()
	}
	return (
		<header className="bg-hero text-hero-foreground relative overflow-hidden">
			<CoffeeRings />
			<div className="relative z-10 mx-auto max-w-5xl px-safe pt-5">
				{/* the top bar with the brand icon on the left and the menu on the right */}
				<div className="flex items-center justify-between">
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
					{/* the desktop menu items, swapped for the hamburger menu on small screens */}
					<div className="hidden items-center gap-1 sm:flex">
						<ThemeToggle isDark={isDark} onToggle={toggleTheme} />
						{/* plans moves into the user menu once signed in. it only stays in the header for a logged-out visitor */}
						{!session && (
							<AnchorLink href="/plans" className={menuLinkClassName(pathname, "/plans")}>
								Plans
							</AnchorLink>
						)}
						{session ? (
							// the user items live below the avatar dropdown instead of the primary navigation
							<UserMenu
								userId={session.user.id}
								username={session.user.username}
								avatarSource={session.user.avatarSource}
								isAdmin={isAdmin}
							/>
						) : (
							<>
								<AnchorLink
									href={`/login?next=${encodeURIComponent(toSafeRedirectPath(pathname))}`}
									className={cn(buttonVariants({ variant: "ghost" }), "min-h-9", HERO_BUTTON_HOVER)}
								>
									Log in
								</AnchorLink>
								{/* use the "default" variant's primary color as a call to action. cta names the button for analytics */}
								<AnchorLink href="/signup?cta=header" className={cn(buttonVariants({ variant: "default" }), "min-h-9")}>
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
					/>
				</div>
				{/* the hero: Carl and the headline appear with no hydrate fade, the headline shimmers, and the copy fades in.
				    on a narrow screen, the headline spans both columns above Carl. on a wide screen, Carl takes the left and the headline goes right */}
				<div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-4">
					{/* the hero headline: a light wipes across the dimmed text, revealing it in full color.
					keyed to the pathname to replay per route. the overlay copies stay glyph-aligned */}
					<div
						key={pathname}
						className="shimmer-reveal col-span-2 text-center sm:col-span-1 sm:col-start-2 sm:text-left"
					>
						{/* the dimmed heading that the light reveals. the page's real h1. only this copy is a link.
						    the overlay copies are pointer-transparent scenery, so the click always lands here */}
						<h1 className="shimmer-reveal-base font-display text-2xl leading-tight sm:text-4xl">
							{`He already read it. `}
							<AnchorLink href="/" onClick={handleHomeClick} className="text-hero-accent">
								All of it.
							</AnchorLink>
						</h1>
						{/* the full-color copy the light wipes in from the left */}
						<div aria-hidden="true" className="shimmer-reveal-top font-display text-2xl leading-tight sm:text-4xl">
							He already read it. <span className="text-hero-accent">All of it.</span>
						</div>
						{/* a white glint riding the reveal edge */}
						<div aria-hidden="true" className="shimmer-reveal-glint font-display text-2xl leading-tight sm:text-4xl">
							He already read it. All of it.
						</div>
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
							alt="Carl, holding a raccoon and a machine learning textbook"
							className="w-28 pb-6 -mb-4 sm:w-52"
						/>
					</AnchorLink>
					{/* the copy clears the search bar overlapping the hero's bottom edge */}
					<div className="col-start-2 row-start-2 min-w-0 pb-10">
						{/* Carl's pitch, then the call to action and the tagline.
						    the pitch on a narrow screen is hidden and shows up in a popup instead */}
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
			</div>
		</header>
	)
}

// the mobile-only hamburger menu. it mirrors the wide-screen menu's items
function HeaderMenu({
	isDark,
	onToggleTheme,
	isSignedIn,
	isAdmin,
	userId,
}: {
	isDark: boolean
	onToggleTheme: () => void
	isSignedIn: boolean
	isAdmin: boolean
	userId: string
}) {
	// the path is used to highlight the current menu option
	const { pathname } = useLocation()
	// controlled so every item click closes the menu, including navigation and the sign-out confirmation
	const [isOpen, setIsOpen] = useState(false)
	const closeMenu = (): void => {
		setIsOpen(false)
	}

	// the sign-out confirmation is opened from here and shared by a trigger inside the menu
	const [isConfirmingSignOut, setIsConfirmingSignOut] = useState(false)
	const confirmSignOut = (): void => {
		setIsConfirmingSignOut(true)
		closeMenu()
	}

	// the menu cannot be open while the confirmation is, so it won't overlap the dialog
	const isMenuOpen = isOpen && !isConfirmingSignOut
	return (
		<>
			<Popover open={isMenuOpen} onOpenChange={setIsOpen}>
				<PopoverTrigger
					className="grid size-11 place-items-center rounded-md hover:bg-white/10 sm:hidden"
					aria-label="Menu"
				>
					<Menu className="size-5" />
				</PopoverTrigger>
				<PopoverContent align="end" className="w-44 p-1">
					<button
						type="button"
						onClick={() => {
							onToggleTheme()
							closeMenu()
						}}
						className={MENU_ITEM_CLASS}
					>
						{isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
						{isDark ? "Light mode" : "Dark mode"}
					</button>
					{/* plans goes into the user menu once signed in */}
					{!isSignedIn && (
						<AnchorLink href="/plans" onClick={closeMenu} className={menuItemClassName(pathname, "/plans")}>
							<Columns3Cog className="size-4" />
							Plans
						</AnchorLink>
					)}
					{isSignedIn ? (
						// the user menu items form the block below a horizontal divider
						<>
							<div className="bg-border my-1 h-px" />
							<UserMenuItems userId={userId} isAdmin={isAdmin} onNavigate={closeMenu} onSignOut={confirmSignOut} />
						</>
					) : (
						<>
							<AnchorLink
								href={`/login?next=${encodeURIComponent(toSafeRedirectPath(pathname))}`}
								onClick={closeMenu}
								className={MENU_ITEM_CLASS}
							>
								<LogIn className="size-4" />
								Log in
							</AnchorLink>
							{/* use the primary color as a call to action. cta names the button for analytics */}
							<AnchorLink
								href="/signup?cta=menu"
								onClick={closeMenu}
								className={cn(MENU_ITEM_CLASS, "bg-primary text-primary-foreground hover:bg-primary/90")}
							>
								<UserPlus className="size-4" />
								Sign up
							</AnchorLink>
						</>
					)}
				</PopoverContent>
			</Popover>
			<SignOutDialog open={isConfirmingSignOut} onOpenChange={setIsConfirmingSignOut} />
		</>
	)
}

// the narrow screen note button after the tagline
function PitchButton() {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						className="hover:opacity-75 ml-1 inline-grid size-5 translate-y-0.5 place-items-center align-text-bottom sm:hidden"
						aria-label="Meet Carl"
					>
						{/* the tile fills this inline box exactly, so the line keeps its height */}
						<NoteIcon className="size-5 rounded-sm" />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>A note from Carl</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className="w-72 text-sm font-normal">
				<PopoverCloseButton />
				{/* the title, under a label so the first line clears the close button */}
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
						{/* the tile fills this inline box exactly, so the line keeps its height */}
						<NoteIcon className="size-5 rounded-sm" />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>A note from Carl</TooltipContent>
			</Tooltip>
			<PopoverContent align="start" className="w-80 text-sm">
				<PopoverCloseButton />
				{/* the persona credit, under a label so the first line clears the close button */}
				<div className="text-muted-foreground font-display mb-1 text-center text-xs tracking-wide uppercase">
					The Real Carl
				</div>
				<Attribution />
			</PopoverContent>
		</Popover>
	)
}
