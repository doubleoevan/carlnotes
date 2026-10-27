import type { ComponentType, ReactNode } from "react"

// the same destination labels double as stable icon names in both platform adapters
export type UserMenuIcon =
	| "Profile"
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
	href: string
	isSelected: boolean
	onSelect: () => void
	children?: ReactNode
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
	isAdmin,
	pathname,
	onNavigate,
	onPlayTutorial,
	onSignOut,
	isSigningOut,
	renderBadge,
}: {
	elements: UserMenuElements
	userId: string
	isAdmin: boolean
	pathname: string
	onNavigate: () => void
	onPlayTutorial: () => void
	onSignOut: () => void
	isSigningOut?: boolean
	renderBadge?: (label: "Profile" | "Teams" | "Activity") => ReactNode
}) {
	const { Link, Action, Divider } = elements
	const destinations = [
		{ label: "Profile", href: `/profiles/${userId}` },
		{ label: "Teams", href: "/teams" },
		{ label: "Activity", href: "/activity" },
		{ label: "Account", href: "/account" },
	] as const
	return (
		<>
			{/* account destinations and their optional live counts */}
			{destinations.map(({ label, href }) => (
				<Link key={label} label={label} href={href} isSelected={pathname === href} onSelect={onNavigate}>
					{label !== "Account" && renderBadge?.(label)}
				</Link>
			))}
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
			{isAdmin && <Link label="Admin" href="/admin" isSelected={pathname === "/admin"} onSelect={onNavigate} />}
			<Action label="Sign out" isDisabled={isSigningOut} onSelect={onSignOut} />
		</>
	)
}
