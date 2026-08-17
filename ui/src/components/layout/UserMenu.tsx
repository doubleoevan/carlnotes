import { Activity, CircleUserRound, Columns3Cog, LogOut, ShieldUser, User } from "lucide-react"
import { useState } from "react"
import { useLocation } from "react-router-dom"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { DocsLink } from "@/components/layout/DocsLink"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { SignOutDialog } from "@/components/session/SignOutDialog"
import { cn } from "@/lib/utils"

// the row styling shared by every item in the user menu and the mobile drawer
export const MENU_ITEM_CLASS =
	"hover:bg-accent flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm [&:not(:first-child)]:mt-0.5"

// a menu row's classes that highlight the current page
export function menuItemClassName(pathname: string, href: string): string {
	return cn(MENU_ITEM_CLASS, pathname === href && "bg-accent")
}

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
	// controlled so the menu closes on item click and navigation
	const [isOpen, setIsOpen] = useState(false)
	const handleCloseMenu = (): void => {
		setIsOpen(false)
	}

	// the sign-out confirmation dialog replaces the user menu instead of sitting over it
	const [isConfirmingSignOut, setIsConfirmingSignOut] = useState(false)
	const handleConfirmSignOut = (): void => {
		setIsConfirmingSignOut(true)
		handleCloseMenu()
	}

	return (
		<>
			<Popover open={isOpen && !isConfirmingSignOut} onOpenChange={setIsOpen}>
				<PopoverTrigger className="ml-1 hidden rounded-full sm:block" aria-label="User menu">
					{/* the user avatar trigger button */}
					<UserAvatar
						userId={userId}
						username={username}
						avatarSource={avatarSource}
						className="size-9 border-2 border-white/55"
					/>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-52 p-1">
					{/* the menu items for a logged-in user */}
					<UserMenuItems
						userId={userId}
						isAdmin={isAdmin}
						onNavigate={handleCloseMenu}
						onSignOut={handleConfirmSignOut}
					/>
				</PopoverContent>
			</Popover>
			<SignOutDialog open={isConfirmingSignOut} onOpenChange={setIsConfirmingSignOut} />
		</>
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
	// the current path is used to highlight the menu option
	const { pathname } = useLocation()
	return (
		<>
			{/* the menu items in the order they appear in the dropdown */}
			<AnchorLink
				href={`/profiles/${userId}`}
				onClick={onNavigate}
				className={menuItemClassName(pathname, `/profiles/${userId}`)}
			>
				<CircleUserRound className="size-4" />
				Profile
			</AnchorLink>
			<AnchorLink href="/activity" onClick={onNavigate} className={menuItemClassName(pathname, "/activity")}>
				<Activity className="size-4" />
				Activity
			</AnchorLink>
			<AnchorLink href="/account" onClick={onNavigate} className={menuItemClassName(pathname, "/account")}>
				<User className="size-4" />
				Account
			</AnchorLink>
			<AnchorLink href="/plans" onClick={onNavigate} className={menuItemClassName(pathname, "/plans")}>
				<Columns3Cog className="size-4" />
				Plans
			</AnchorLink>
			<DocsLink className={MENU_ITEM_CLASS} hasIcon onNavigate={onNavigate} />
			{isAdmin ? (
				<AnchorLink href="/admin" onClick={onNavigate} className={menuItemClassName(pathname, "/admin")}>
					<ShieldUser className="size-4" />
					Admin
				</AnchorLink>
			) : null}
			{/* sign-out always comes last with no highlight class */}
			<button type="button" onClick={onSignOut} className={MENU_ITEM_CLASS}>
				<LogOut className="size-4" />
				Sign out
			</button>
		</>
	)
}
