import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import type * as React from "react"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { cn } from "@/lib/utils"
import { AnchorLink } from "./AnchorLink"

/**
 * The user's avatar and username, linking to their profile.
 */
export function UserProfileLink({
	user,
	avatarClassName = "size-6",
	className,
	label,
	displayName,
	isNewTab,
	...props
}: {
	user: ProfileIdentity
	avatarClassName?: string
	className?: string
	// the words before the username. omitted, the username stands alone
	label?: string
	// what the link shows instead of the username
	displayName?: string
	// opens the profile in a new tab, for a link inside a table the user is still working in
	isNewTab?: boolean
} & React.ComponentProps<"a">) {
	// a display name shows alone, and a screen reader reads the username after it
	const linkText = (
		<span className="text-link">
			{displayName ?? user.username}
			{displayName && displayName !== user.username && <span className="sr-only">{` (@${user.username})`}</span>}
		</span>
	)

	// the rest props flow to the anchor, so a tooltip trigger can wrap this link asChild
	return (
		<AnchorLink
			href={`/profiles/${user.userId}`}
			isNewTab={isNewTab}
			{...props}
			className={cn("inline-flex items-center gap-2 hover:underline", className)}
		>
			<UserAvatar
				userId={user.userId}
				username={user.username}
				avatarVersion={user.avatarVersion}
				className={avatarClassName}
			/>
			{label ? (
				<span className="text-muted-foreground">
					{label} {linkText}
				</span>
			) : (
				linkText
			)}
		</AnchorLink>
	)
}
