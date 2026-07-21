import { LogIn, Menu, Moon, Sun } from "lucide-react"
import { AnchorLink } from "@/components/AnchorLink"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { CoffeeRings } from "@/components/branding/CoffeeRings"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { ThemeToggle } from "@/components/ThemeToggle"
import { useTheme } from "@/hooks/useTheme"

/**
 * The global header
 */
export function Header() {
	const { isDark, toggleTheme } = useTheme()
	return (
		<header className="bg-hero text-hero-foreground relative overflow-hidden">
			<CoffeeRings />
			<div className="relative z-10 mx-auto max-w-5xl px-4 pt-5 pb-16">
				{/* the top bar with the brand icon on the left and the menu on the right */}
				<div className="flex items-center justify-between">
					{/* the brand links back to the home topic feed */}
					<AnchorLink href="/" aria-label="CarlNotes home" className="flex items-center gap-2 rounded-md">
						<CoffeeMug />
						<span className="font-display text-xl">CarlNotes</span>
					</AnchorLink>
					{/* the desktop menu items, swapped for the hamburger menu on small screens */}
					<div className="hidden items-center gap-1 sm:flex">
						<ThemeToggle isDark={isDark} onToggle={toggleTheme} />
						<Button
							variant="ghost"
							className="min-h-9 hover:bg-white/10 hover:text-hero-foreground dark:hover:bg-white/10"
						>
							Sign in
						</Button>
					</div>
					<HeaderMenu isDark={isDark} onToggle={toggleTheme} />
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

// the mobile-only hamburger menu
function HeaderMenu({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
	return (
		<Popover>
			<PopoverTrigger
				className="grid size-11 place-items-center rounded-md hover:bg-white/10 sm:hidden"
				aria-label="Menu"
			>
				<Menu className="size-5" />
			</PopoverTrigger>
			<PopoverContent align="end" className="w-44 p-1">
				<button
					type="button"
					onClick={onToggle}
					className="hover:bg-accent flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm"
				>
					{isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
					{isDark ? "Light mode" : "Dark mode"}
				</button>
				<button
					type="button"
					className="hover:bg-accent flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm"
				>
					<LogIn className="size-4" />
					Sign in
				</button>
			</PopoverContent>
		</Popover>
	)
}
