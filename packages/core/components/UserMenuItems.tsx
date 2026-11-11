import { toProfilePageTitle } from "@carlnotes/contracts/profilePage"
import { toProfilePath } from "@carlnotes/contracts/seo"
import type { ComponentType, ReactNode } from "react"

// the same destination labels double as stable icon names in both platform adapters
type UserMenuIcon =
	| "Topics"
	| "Café"
	| "Teams"
	| "Activity"
	| "Account"
	| "Plans"
	| "Brew with Carl"
	| "What CarlNotes Is"
	| "Admin"
	| "Sign out"
export type UserMenuLinkProps = {
	label: UserMenuIcon
	// the row's words where they differ from its label, as the Café row's name the user
	text?: string
	href: string
	isSelected: boolean
	onSelect: () => void
	children?: ReactNode
}
// one account destination: its stable name, its words if they differ, its page, and the row whose badge it shows
type UserMenuDestination = Pick<UserMenuLinkProps, "label" | "text" | "href"> & {
	badgeLabel: "Profile" | "Teams" | "Activity" | null
}
export type UserMenuElements = {
	Link: ComponentType<UserMenuLinkProps>
	Action: ComponentType<{ label: UserMenuIcon; onSelect: () => void; isDisabled?: boolean }>
	Divider: ComponentType
}

/**
 * Shares menu destinations, labels, grouping, selection, and the Admin permission gate.
 */
export function UserMenuItems({
	elements,
	userId,
	username,
	isAdmin,
	pathname,
	onNavigate,
	onPlayTutorial,
	onSignOut,
	isSigningOut,
	renderBadge,
	mentionsRow,
}: {
	elements: UserMenuElements
	userId: string
	username: string
	isAdmin: boolean
	pathname: string
	onNavigate: () => void
	onPlayTutorial: () => void
	onSignOut: () => void
	isSigningOut?: boolean
	renderBadge?: (label: "Profile" | "Teams" | "Activity" | "Admin") => ReactNode
	// the row that opens the user's unseen Comment Mentions, after the account destinations
	mentionsRow?: ReactNode
}) {
	const { Link, Action, Divider } = elements
	// each destination with the row whose badge it shows. the profile page reads as the user's own Café
	const destinations: UserMenuDestination[] = [
		{ label: "Topics", href: "/topics", badgeLabel: null },
		{ label: "Café", text: toProfilePageTitle(username), href: toProfilePath(userId), badgeLabel: "Profile" },
		{ label: "Teams", href: "/teams", badgeLabel: "Teams" },
		{ label: "Activity", href: "/activity", badgeLabel: "Activity" },
		{ label: "Account", href: "/account", badgeLabel: null },
	]
	return (
		<>
			{/* account destinations and their optional live counts */}
			{destinations.map(({ label, text, href, badgeLabel }) => (
				<Link key={label} label={label} text={text} href={href} isSelected={pathname === href} onSelect={onNavigate}>
					{badgeLabel && renderBadge?.(badgeLabel)}
				</Link>
			))}
			{mentionsRow}
			<Divider />
			{/* plans and learning */}
			<Link label="Plans" href="/plans" isSelected={pathname === "/plans"} onSelect={onNavigate} />
			<Action
				label="Brew with Carl"
				onSelect={() => {
					onNavigate()
					onPlayTutorial()
				}}
			/>
			<Link label="What CarlNotes Is" href="/docs" isSelected={false} onSelect={onNavigate} />
			<Divider />
			{/* admin and session controls */}
			{isAdmin && (
				<Link label="Admin" href="/admin" isSelected={pathname === "/admin"} onSelect={onNavigate}>
					{renderBadge?.("Admin")}
				</Link>
			)}
			<Action label="Sign out" isDisabled={isSigningOut} onSelect={onSignOut} />
		</>
	)
}
