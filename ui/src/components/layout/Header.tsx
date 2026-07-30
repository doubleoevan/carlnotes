import {
	Activity,
	BadgeDollarSign,
	LogIn,
	LogOut,
	Menu,
	Moon,
	ShieldUser,
	SquarePen,
	Sun,
	User,
	UserPlus,
} from "lucide-react"
import { useState } from "react"
import { useLocation } from "react-router-dom"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { CoffeeRings } from "@/components/branding/CoffeeRings"
import { AnchorLink } from "@/components/layout/AnchorLink"
import { Attribution } from "@/components/layout/Attribution"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { buttonVariants } from "@/components/primitives/button"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { SignOutDialog } from "@/components/session/SignOutDialog"
import { useTheme } from "@/hooks/useTheme"
import { authClient } from "@/lib/authClient"
import { cn } from "@/lib/utils"

// the hover treatment shared by the header's menu buttons, tuned for the dark hero banner
const HERO_BUTTON_HOVER = "hover:bg-white/10 hover:text-hero-foreground dark:hover:bg-white/10"

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
	return (
		<header className="bg-hero text-hero-foreground relative overflow-hidden">
			<CoffeeRings />
			<div className="relative z-10 mx-auto max-w-5xl px-safe pt-5">
				{/* the top bar with the brand icon on the left and the menu on the right */}
				<div className="flex items-center justify-between">
					{/* the brand links back to the home topic feed. the wordmark animates in while the mug stays static */}
					<AnchorLink href="/" aria-label="CarlNotes home" className="flex items-center gap-2 rounded-md">
						{/* nudge the cup up to align with the text */}
						<CoffeeMug className="-translate-y-0.5" />
						<span className="animate-hydrate font-display text-xl">CarlNotes</span>
					</AnchorLink>
					{/* the desktop menu items, swapped for the hamburger menu on small screens */}
					<div className="hidden items-center gap-1 sm:flex">
						<ThemeToggle isDark={isDark} onToggle={toggleTheme} />
						{/* buttonVariants style these AnchorLinks directly. AnchorLink can't compose with Button's asChild */}
						<AnchorLink href="/pricing" className={menuLinkClassName(pathname, "/pricing")}>
							Pricing
						</AnchorLink>
						{isSignedIn ? (
							<>
								<AnchorLink href="/activity" className={menuLinkClassName(pathname, "/activity")}>
									Activity
								</AnchorLink>
								<AnchorLink href="/account" className={menuLinkClassName(pathname, "/account")}>
									Account
								</AnchorLink>
								{isAdmin ? (
									<AnchorLink href="/admin" className={menuLinkClassName(pathname, "/admin")}>
										Admin
									</AnchorLink>
								) : null}
								<SignOutDialog className={cn(buttonVariants({ variant: "ghost" }), "min-h-9", HERO_BUTTON_HOVER)}>
									Sign out
								</SignOutDialog>
							</>
						) : (
							<>
								<AnchorLink
									href="/login"
									className={cn(buttonVariants({ variant: "ghost" }), "min-h-9", HERO_BUTTON_HOVER)}
								>
									Log in
								</AnchorLink>
								{/* use the "default" variant's primary color as a call to action */}
								<AnchorLink href="/signup" className={cn(buttonVariants({ variant: "default" }), "min-h-9")}>
									Sign up
								</AnchorLink>
							</>
						)}
					</div>
					<HeaderMenu isDark={isDark} onToggleTheme={toggleTheme} isSignedIn={isSignedIn} isAdmin={isAdmin} />
				</div>
				{/* the hero: Carl and the headline appear immediately with no hydrate fade, the headline plays a shimmer and the body copy fades in.
				    the image is pulled down so Carl's lower half tucks behind the search bar card below.
				    on a narrow screen it stacks so that the copy floats above Carl, who centers on his own row */}
				<div className="mt-6 flex flex-col-reverse items-center gap-4 sm:flex-row sm:items-end">
					<img
						src="/carl-hero.png"
						alt="Carl, holding a raccoon and a machine learning textbook"
						className="w-36 shrink-0 self-center pb-6 -mb-4 sm:ml-4 sm:w-52 sm:self-end"
					/>
					<div className="min-w-0 pb-4 sm:pb-10">
						{/* the hero headline: a light wipes across the dimmed text, revealing it in full color. keyed to replay per route */}
						<div key={pathname} className="shimmer-reveal">
							{/* the dimmed heading that the light reveals — the page's real h1 */}
							<h1 className="shimmer-reveal-base font-display text-2xl leading-tight sm:text-4xl">
								He already read it. <span className="text-hero-accent">All of it.</span>
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
						{/* Carl's pitch, then the call to action and the tagline */}
						<div className="animate-hydrate mt-3 text-sm" style={{ animationDelay: "80ms" }}>
							<p className="max-w-xl">
								{
									"Carl doesn't check the news. The news checks in with Carl. Carl never sleeps. He drinks coffee and reads everything. He finished the internet. Now he checks nightly for new stuff. And when you drop by, he has notes."
								}
								<AttributionButton />
							</p>
							<p className="mt-3 font-bold">
								{"Give Carl three topics. You know the ones. He'll brew a hot cup of what you just missed."}
							</p>
							<p className="text-hero-accent mt-1 font-bold">Carl stays up. You stay informed.</p>
						</div>
					</div>
				</div>
			</div>
		</header>
	)
}

// the mobile-only hamburger menu. it mirrors the desktop menu's items
function HeaderMenu({
	isDark,
	onToggleTheme,
	isSignedIn,
	isAdmin,
}: {
	isDark: boolean
	onToggleTheme: () => void
	isSignedIn: boolean
	isAdmin: boolean
}) {
	// the row styling shared by every item in the popover
	const itemClassName = "hover:bg-accent flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm"
	// controlled so every item click closes the menu, including navigation and the sign-out confirmation
	const [isOpen, setIsOpen] = useState(false)
	const closeMenu = (): void => {
		setIsOpen(false)
	}
	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
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
					className={itemClassName}
				>
					{isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
					{isDark ? "Light mode" : "Dark mode"}
				</button>
				<AnchorLink href="/pricing" onClick={closeMenu} className={itemClassName}>
					<BadgeDollarSign className="size-4" />
					Pricing
				</AnchorLink>
				{isSignedIn ? (
					<>
						<AnchorLink href="/activity" onClick={closeMenu} className={itemClassName}>
							<Activity className="size-4" />
							Activity
						</AnchorLink>
						<AnchorLink href="/account" onClick={closeMenu} className={itemClassName}>
							<User className="size-4" />
							Account
						</AnchorLink>
						{isAdmin ? (
							<AnchorLink href="/admin" onClick={closeMenu} className={itemClassName}>
								<ShieldUser className="size-4" />
								Admin
							</AnchorLink>
						) : null}
						<SignOutDialog onTriggerClick={closeMenu} className={itemClassName}>
							<LogOut className="size-4" />
							Sign out
						</SignOutDialog>
					</>
				) : (
					<>
						<AnchorLink href="/login" onClick={closeMenu} className={itemClassName}>
							<LogIn className="size-4" />
							Log in
						</AnchorLink>
						{/* use the primary color as a call to action */}
						<AnchorLink
							href="/signup"
							onClick={closeMenu}
							className={cn(itemClassName, "bg-primary text-primary-foreground hover:bg-primary/90")}
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

// a pen button tucked after the pitch. it opens the persona attribution in a popover with a close ✕
function AttributionButton() {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						className="text-primary hover:opacity-75 ml-1 inline-grid size-5 translate-y-0.5 place-items-center rounded-md align-text-bottom"
						aria-label="About the CarlNotes persona"
					>
						<SquarePen className="size-3.75" strokeWidth={2.5} />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>A note from Carl</TooltipContent>
			</Tooltip>
			<PopoverContent align="start" className="w-80 text-sm">
				<PopoverCloseButton />
				{/* the persona credit, under a label so the first line clears the close ✕ */}
				<div className="text-muted-foreground font-display mb-1 text-center text-xs tracking-wide uppercase">
					The Real Carl
				</div>
				<Attribution />
			</PopoverContent>
		</Popover>
	)
}
