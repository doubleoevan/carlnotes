import type { Plan } from "@carlnotes/contracts/plans"
import { cn } from "@carlnotes/nightshift/classNames"
import type { ReactNode } from "react"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"

// the user that a user table row names
type UserLinkUser = { userId: string; username: string }

/**
 * A user's avatar and username in a user table, linking to their profile.
 */
export function UserNameLink({ user }: { user: UserLinkUser & { avatarVersion: string | null } }) {
	return (
		<UserPageLink
			href={`/profiles/${user.userId}`}
			tooltip={`${user.username}'s profile`}
			className="flex items-center gap-2"
		>
			<UserAvatar userId={user.userId} username={user.username} avatarVersion={user.avatarVersion} className="size-6" />
			{user.username}
		</UserPageLink>
	)
}

/**
 * A user's email in an admin user table, linking to their activity page.
 */
export function UserEmailLink({ user }: { user: UserLinkUser & { email: string } }) {
	return (
		<UserPageLink
			href={`/activity?userId=${user.userId}`}
			tooltip={`${user.username}'s activity`}
			className="block max-w-52 truncate text-left"
		>
			{user.email}
		</UserPageLink>
	)
}

/**
 * A user's plan in an admin user table, linking to their account page.
 */
export function UserPlanLink({ user }: { user: UserLinkUser & { plan: Plan } }) {
	return (
		<UserPageLink href={`/account?userId=${user.userId}`} tooltip={`${user.username}'s account`} className="capitalize">
			{user.plan}
		</UserPageLink>
	)
}

// a link to one of a user's pages, with a tooltip naming the page
function UserPageLink({
	href,
	tooltip,
	className,
	children,
}: {
	href: string
	tooltip: string
	className: string
	children: ReactNode
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<AnchorLink href={href} className={cn(STANDALONE_LINK_CLASS, className)}>
					{children}
				</AnchorLink>
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	)
}
