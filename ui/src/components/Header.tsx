import { LogIn, LogOut, Menu, Moon, Sun, UserPlus } from "lucide-react"
import { AnchorLink } from "@/components/AnchorLink"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { CoffeeRings } from "@/components/branding/CoffeeRings"
import { buttonVariants } from "@/components/primitives/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { SignOutDialog } from "@/components/SignOutDialog"
import { ThemeToggle } from "@/components/ThemeToggle"
import { useTheme } from "@/hooks/useTheme"
import { authClient } from "@/lib/authClient"
import { cn } from "@/lib/utils"

// the hover treatment shared by the header's menu buttons, tuned for the dark hero banner
const HERO_BUTTON_HOVER = "hover:bg-white/10 hover:text-hero-foreground dark:hover:bg-white/10"

/**
 * The global header that renders on every page
 */
export function Header() {
	const { isDark, toggleTheme } = useTheme()
	// drives the menu items in both the desktop menu and the mobile menu
	const { data: session } = authClient.useSession()
	const isSignedIn = Boolean(session)
	return (
		<header className="bg-hero text-hero-foreground relative overflow-hidden">
			<CoffeeRings />
			<div className="relative z-10 mx-auto max-w-5xl px-4 pt-5 pb-16">
				{/* the top bar with the brand icon on the left and the menu on the right */}
				<div className="flex items-center justify-between">
					{/* the brand links back to the home page */}
					<AnchorLink href="/" aria-label="CarlNotes home" className="flex items-center gap-2 rounded-md">
						{/* nudged up to align the cup with the text */}
						<CoffeeMug className="-translate-y-0.5" />
						<span className="font-display text-xl">CarlNotes</span>
					</AnchorLink>
					{/* the desktop menu items, swapped for the hamburger menu on small screens */}
					<div className="hidden items-center gap-1 sm:flex">
						<ThemeToggle isDark={isDark} onToggle={toggleTheme} />
						{/* buttonVariants style these AnchorLinks directly. AnchorLink can't compose with Button's asChild */}
						{isSignedIn ? (
							<SignOutDialog className={cn(buttonVariants({ variant: "ghost" }), "min-h-9", HERO_BUTTON_HOVER)}>
								Sign out
							</SignOutDialog>
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
					<HeaderMenu isDark={isDark} onToggle={toggleTheme} isSignedIn={isSignedIn} />
				</div>
				{/* the headline and description use the hydrate entrance animation */}
				<div className="animate-hydrate mt-12 text-center" style={{ animationDelay: "80ms" }}>
					<h1 className="font-display text-4xl leading-tight sm:text-5xl">
						He already read it. <span className="text-primary">All of it.</span>
					</h1>
					<p className="mt-4 text-lg">Give Carl three topics. You know the ones.</p>
					<p className="text-hero-muted mt-1.5">Carl stays up. You stay informed.</p>
				</div>
			</div>
		</header>
	)
}

// the mobile-only hamburger menu. it mirrors the desktop menu's items
function HeaderMenu({ isDark, onToggle, isSignedIn }: { isDark: boolean; onToggle: () => void; isSignedIn: boolean }) {
	// the row styling shared by every item in the popover
	const itemClassName = "hover:bg-accent flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm"
	return (
		<Popover>
			<PopoverTrigger
				className="grid size-11 place-items-center rounded-md hover:bg-white/10 sm:hidden"
				aria-label="Menu"
			>
				<Menu className="size-5" />
			</PopoverTrigger>
			<PopoverContent align="end" className="w-44 p-1">
				<button type="button" onClick={onToggle} className={itemClassName}>
					{isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
					{isDark ? "Light mode" : "Dark mode"}
				</button>
				{isSignedIn ? (
					<SignOutDialog className={itemClassName}>
						<LogOut className="size-4" />
						Sign out
					</SignOutDialog>
				) : (
					<>
						<AnchorLink href="/login" className={itemClassName}>
							<LogIn className="size-4" />
							Log in
						</AnchorLink>
						{/* use the primary color as a call to action */}
						<AnchorLink
							href="/signup"
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
